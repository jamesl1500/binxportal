"""Binx's error library: typed errors, request context, and error capture.

Three things live here; ``core/error_handling.py`` wires them into the app.

**Typed errors.** Raise an ``AppError`` subclass instead of a bare
``HTTPException`` when you want a machine-readable ``code`` the frontend can
branch on::

    raise NotFound("Project not found")                      # 404, code "not_found"
    raise Conflict("Already invited", code="already_invited")
    raise UpstreamError("Stripe didn't answer", service="stripe")  # 502, reported

Every error response has the same shape. ``detail`` is kept as it always
was, so binx-web's ``extractDetailMessage`` doesn't change::

    {"detail": "Project not found", "code": "not_found", "request_id": "…"}

and an unexpected (reported) error adds the ``reference`` a customer can quote
to support, which the admin console can look up (/admin/errors)::

    {"detail": "Something went wrong on our end.", "code": "internal_error",
     "request_id": "…", "reference": "7F3A9C21"}

``expected`` decides whether an error gets *reported*. A 404 or a 409 is the
API working as designed, so it never reaches Sentry or the error log. A 5xx,
or anything that isn't an ``AppError`` at all, is reported.

**Request context.** ``RequestContext`` (set by the middleware in
error_handling.py, filled in by ``get_current_user``) carries the request id
and the signed-in user, so a captured error knows who hit it and where, even
when it's captured deep in a service function.

**Capture.** When you catch an error and carry on (a background step, a
best-effort side effect), call ``await capture_error(exc, ...)`` so it isn't
silently lost. It goes to Sentry *and* the admin error log, and returns the
reference. ``report_error`` is the sync, fire-and-forget version for code
that can't await. Don't use either for errors you re-raise: the exception
handlers report those.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Mapping
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

import sentry_sdk

# A dedicated logger that Sentry's logging integration ignores (see
# error_handling.init_sentry). Errors logged here are already sent to Sentry
# explicitly, so letting the integration turn the log line into a second event
# would double-count them.
logger = logging.getLogger("binx_api.errors")

INTERNAL_ERROR_MESSAGE = "Something went wrong on our end."


# --- Typed errors ------------------------------------------------------------


class AppError(Exception):
    """Base for every error the API raises on purpose.

    Subclasses set the class defaults. ``message`` and ``code`` can be
    overridden per raise. ``details`` is optional structured data for the
    client (which field clashed, the limit that was hit, ...) and is returned
    as-is, so never put anything secret in it.
    """

    status_code: int = 500
    code: str = "internal_error"
    message: str = INTERNAL_ERROR_MESSAGE
    # True: a normal outcome of using the API (bad input, not found, no
    # permission). Never reported to Sentry or the admin error log.
    expected: bool = False

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        self.message = message or type(self).message
        self.code = code or type(self).code
        self.details = dict(details) if details else None
        self.headers = dict(headers) if headers else None
        super().__init__(self.message)


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"
    message = "That request isn't valid."
    expected = True


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    message = "You need to sign in."
    expected = True


class PaymentRequired(AppError):
    status_code = 402
    code = "payment_required"
    message = "That needs a higher plan."
    expected = True


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    message = "You don't have access to that."
    expected = True


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    message = "Not found."
    expected = True


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    message = "That conflicts with something that already exists."
    expected = True


class Unprocessable(AppError):
    status_code = 422
    code = "invalid"
    message = "Some of that isn't valid."
    expected = True


class TooManyRequests(AppError):
    status_code = 429
    code = "rate_limited"
    message = "Too many requests. Wait a moment and try again."
    expected = True


class UpstreamError(AppError):
    """A third party we depend on (Stripe, Anthropic, SES, S3, ...) failed.
    It's reported, because it's either their outage or our integration bug,
    and both are worth seeing. Chain the original with ``raise ... from exc``
    so the real stack trace is what gets recorded."""

    status_code = 502
    code = "upstream_error"
    message = "A service we rely on didn't respond. Try again shortly."

    def __init__(self, message: str | None = None, *, service: str, **kwargs: Any) -> None:
        self.service = service
        super().__init__(message, **kwargs)


class ServiceUnavailable(AppError):
    """Something on our side isn't available or configured (a missing Stripe
    key, a dependency that's down). Reported."""

    status_code = 503
    code = "service_unavailable"
    message = "That isn't available right now."


# What a plain HTTPException's status maps to, so responses from the ~300
# existing ``raise HTTPException(...)`` sites get a ``code`` too.
STATUS_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    402: "payment_required",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    410: "gone",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "invalid",
    429: "rate_limited",
    500: "internal_error",
    502: "upstream_error",
    503: "service_unavailable",
    504: "upstream_timeout",
}


def code_for_status(status_code: int) -> str:
    return STATUS_CODES.get(status_code, "internal_error" if status_code >= 500 else "error")


def is_reportable(exc: BaseException) -> bool:
    """False for the API working as designed: an expected AppError, or any
    4xx HTTPException. Lets ``except Exception`` sites that turn failures
    into a message (AI tool calls, fallbacks) report only the real bugs."""
    if isinstance(exc, AppError):
        return not exc.expected
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int) and hasattr(exc, "detail"):  # Starlette/FastAPI HTTPException
        return status_code >= 500
    return True


# --- Request context -----------------------------------------------------------


@dataclass
class RequestContext:
    """Who and what the current request is. A mutable object held in a
    ContextVar, so ``get_current_user`` can fill in ``user_id`` partway
    through and everything else in the request (including code run in a
    copied context, like a threadpool) sees it."""

    request_id: str
    method: str | None = None
    path: str | None = None
    user_id: uuid.UUID | None = None
    agency_id: uuid.UUID | None = None
    extra: dict[str, Any] = field(default_factory=dict)


_request_context: ContextVar[RequestContext | None] = ContextVar("binx_request_context", default=None)


def current_request_context() -> RequestContext | None:
    return _request_context.get()


def set_request_context(ctx: RequestContext | None):
    return _request_context.set(ctx)


def reset_request_context(token) -> None:
    _request_context.reset(token)


def new_request_id() -> str:
    return uuid.uuid4().hex


def bind_user(user_id: uuid.UUID, *, role: str | None = None) -> None:
    """Attach the signed-in user to the current request's errors, both here
    and in Sentry. Only the id (and role) go to Sentry, never the email."""
    ctx = current_request_context()
    if ctx is not None:
        ctx.user_id = user_id
    sentry_sdk.set_user({"id": str(user_id), **({"segment": role} if role else {})})


def new_reference(event_id: uuid.UUID) -> str:
    """The short code a customer can read out to support: the first eight
    hex digits of the error-log row's id, upper-cased ("7F3A9C21")."""
    return event_id.hex[:8].upper()


# --- Capture -------------------------------------------------------------------


@dataclass
class CapturedError:
    """What ``capture_error`` hands back. ``reference`` is shown to the user;
    ``sentry_event_id`` is None when Sentry is off."""

    event_id: uuid.UUID
    reference: str
    sentry_event_id: str | None


def _send_to_sentry(
    exc: BaseException,
    *,
    level: str,
    reference: str,
    tags: Mapping[str, str] | None,
    context: Mapping[str, Any] | None,
) -> str | None:
    """Captures to Sentry with our reference and request id attached as tags,
    so a reference quoted by a customer can be searched in Sentry
    (``binx_ref:7F3A9C21``) as well as in the admin console. A no-op that
    returns None when Sentry isn't initialised."""
    ctx = current_request_context()
    with sentry_sdk.new_scope() as scope:
        scope.set_level(level)  # type: ignore[arg-type]
        scope.set_tag("binx_ref", reference)
        if ctx is not None:
            scope.set_tag("request_id", ctx.request_id)
        if isinstance(exc, AppError):
            scope.set_tag("error_code", exc.code)
            if isinstance(exc, UpstreamError):
                scope.set_tag("upstream", exc.service)
        for key, value in (tags or {}).items():
            scope.set_tag(key, value)
        if context:
            scope.set_context("binx", dict(context))
        return sentry_sdk.capture_exception(exc)


async def capture_error(
    exc: BaseException,
    *,
    level: str = "error",
    tags: Mapping[str, str] | None = None,
    context: Mapping[str, Any] | None = None,
    status_code: int | None = None,
    route: str | None = None,
) -> CapturedError:
    """Reports an error you caught and are handling. It goes to Sentry and the
    admin error log, gets logged, and the reference comes back.

    Never raises. If the error log can't be written (the database is the
    thing that's down, say), the error still reaches Sentry and the log.

    ``context`` is free-form detail shown with the error ("schedule_id":
    ...). Keep secrets and personal data out of it.
    """
    event_id = uuid.uuid4()
    reference = new_reference(event_id)
    sentry_event_id = _send_to_sentry(exc, level=level, reference=reference, tags=tags, context=context)
    logger.log(
        logging.WARNING if level == "warning" else logging.ERROR,
        "Captured %s [ref %s]",
        type(exc).__name__,
        reference,
        exc_info=exc,
    )

    # Imported here, not at the top: the store is a feature module with its
    # own models, and core/ shouldn't need it just to define the error types.
    from binx_api.modules.errors import store

    await store.record_exception(
        exc,
        event_id=event_id,
        reference=reference,
        level=level,
        sentry_event_id=sentry_event_id,
        status_code=status_code,
        route=route,
        context=context,
    )
    return CapturedError(event_id=event_id, reference=reference, sentry_event_id=sentry_event_id)


# Strong references to in-flight fire-and-forget captures. Without them the
# event loop only holds a weak one and a task can be garbage-collected mid-way.
_pending: set[asyncio.Task] = set()


def report_error(
    exc: BaseException,
    *,
    level: str = "error",
    tags: Mapping[str, str] | None = None,
    context: Mapping[str, Any] | None = None,
) -> None:
    """Fire-and-forget ``capture_error`` for sync code. With no running event
    loop there's nowhere to write the error log from, so it only goes to
    Sentry and the log."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        reference = new_reference(uuid.uuid4())
        _send_to_sentry(exc, level=level, reference=reference, tags=tags, context=context)
        logger.error("Captured %s [ref %s] (not stored: no event loop)", type(exc).__name__, reference, exc_info=exc)
        return
    task = loop.create_task(capture_error(exc, level=level, tags=tags, context=context))
    _pending.add(task)
    task.add_done_callback(_pending.discard)
