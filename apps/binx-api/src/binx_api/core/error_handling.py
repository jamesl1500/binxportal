"""Wires ``core/errors.py`` into the FastAPI app: Sentry setup, the request-id
middleware, and one exception handler per kind of error, so every error
response has the same shape and every unexpected error is reported exactly
once, to Sentry and the admin error log.

``create_app()`` calls ``init_sentry()`` then ``install_error_handling(app)``.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import ignore_logger
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.scrubber import DEFAULT_DENYLIST, DEFAULT_PII_DENYLIST, EventScrubber
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from binx_api.core.config import Settings
from binx_api.core.errors import (
    INTERNAL_ERROR_MESSAGE,
    AppError,
    RequestContext,
    capture_error,
    code_for_status,
    current_request_context,
    new_request_id,
    reset_request_context,
    set_request_context,
)

REQUEST_ID_HEADER = "x-request-id"
_REQUEST_ID_HEADER_BYTES = REQUEST_ID_HEADER.encode()
# A caller-supplied id is only trusted if it looks like one, so it can't
# smuggle anything odd into logs or the response header.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")

# Ours on top of Sentry's defaults (passwords, tokens, cookies, auth headers).
_EXTRA_DENYLIST = [
    "x-binx-proxy-secret",
    "x_binx_proxy_secret",
    "refresh_token",
    "access_token",
    "portal_invite_token",
    "card",
    "iban",
    "account_number",
]


# --- Sentry --------------------------------------------------------------------


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Last line of defence against reporting things that aren't bugs: an
    expected AppError or a 4xx HTTPException that reached Sentry by some
    other route (a log line, a third-party integration)."""
    exc = (hint.get("exc_info") or (None, None, None))[1]
    if isinstance(exc, AppError) and exc.expected:
        return None
    if isinstance(exc, StarletteHTTPException) and exc.status_code < 500:
        return None
    return event


def init_sentry(settings: Settings) -> None:
    """Cleanly off when SENTRY_DSN is unset (dev, CI, test)."""
    if not settings.sentry_dsn:
        return
    # Our exception handlers capture every 5xx themselves, with the Binx
    # reference and request id attached. Turning the integrations'
    # auto-capture of 5xx responses off stops them reporting the same error
    # first without those tags (Sentry would then dedupe ours away).
    no_auto_capture: set[int] = set()
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        release=settings.sentry_release,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        event_scrubber=EventScrubber(
            denylist=DEFAULT_DENYLIST + _EXTRA_DENYLIST,
            pii_denylist=DEFAULT_PII_DENYLIST,
            recursive=True,
        ),
        before_send=_before_send,  # type: ignore[arg-type]
        integrations=[
            StarletteIntegration(failed_request_status_codes=no_auto_capture),
            FastApiIntegration(failed_request_status_codes=no_auto_capture),
        ],
    )
    # capture_error sends to Sentry explicitly and logs as well. Without
    # this the logging integration would turn that log line into a second
    # event.
    ignore_logger("binx_api.errors*")


# --- Request context middleware ---------------------------------------------------


class RequestContextMiddleware:
    """Gives every HTTP request an id: the caller's ``X-Request-ID`` if it
    sent a sane one, else a new one. The id is echoed back in the response
    header, tagged on Sentry events, and stored with any error, so a support
    ticket, a Sentry event and an admin-console row can be lined up.

    Plain ASGI rather than BaseHTTPMiddleware so streaming responses (the AI
    stream) pass through untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = ""
        for name, value in scope.get("headers", []):
            if name == _REQUEST_ID_HEADER_BYTES:
                incoming = value.decode("latin-1").strip()
                break
        request_id = incoming if _VALID_REQUEST_ID.fullmatch(incoming) else new_request_id()

        ctx = RequestContext(request_id=request_id, method=scope.get("method"), path=scope.get("path"))
        # Also on the scope: the handler for unhandled exceptions runs in
        # Starlette's ServerErrorMiddleware, *outside* this middleware, after
        # the ContextVar below has been reset.
        scope.setdefault("state", {})["binx_ctx"] = ctx
        token = set_request_context(ctx)
        sentry_sdk.get_isolation_scope().set_tag("request_id", request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if REQUEST_ID_HEADER not in headers:
                    headers.append(REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            reset_request_context(token)


# --- Exception handlers ----------------------------------------------------------


def _ctx(request: Request) -> RequestContext | None:
    return request.scope.get("state", {}).get("binx_ctx")


def _route(request: Request) -> str | None:
    route = request.scope.get("route")
    return getattr(route, "path", None)


def _bind_agency(request: Request) -> None:
    """Most agency routes carry it in the path. Worth having on an error:
    "which customer hit this?" is the first question."""
    ctx = _ctx(request)
    raw = request.path_params.get("agency_id") if ctx is not None else None
    if ctx is not None and raw is not None and ctx.agency_id is None:
        try:
            ctx.agency_id = raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))
        except ValueError:
            pass


def _body(
    request: Request,
    *,
    detail: Any,
    code: str,
    reference: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ctx = _ctx(request)
    body: dict[str, Any] = {"detail": detail, "code": code}
    if details:
        body["details"] = details
    if ctx is not None:
        body["request_id"] = ctx.request_id
    if reference:
        body["reference"] = reference
    return body


def _headers(request: Request, extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = dict(extra or {})
    ctx = _ctx(request)
    if ctx is not None:
        headers.setdefault(REQUEST_ID_HEADER, ctx.request_id)
    return headers


async def _report(request: Request, exc: BaseException, status_code: int) -> str:
    _bind_agency(request)
    # The unhandled-exception handler runs after RequestContextMiddleware
    # has unwound and reset the ContextVar, so put the request's context
    # back for the capture. (A no-op for the handlers that run inside it.)
    ctx = _ctx(request)
    token = set_request_context(ctx) if ctx is not None and current_request_context() is not ctx else None
    try:
        captured = await capture_error(exc, status_code=status_code, route=_route(request))
    finally:
        if token is not None:
            reset_request_context(token)
    return captured.reference


async def app_error_handler(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, AppError)
    reference = None if exc.expected else await _report(request, exc, exc.status_code)
    return JSONResponse(
        _body(request, detail=exc.message, code=exc.code, reference=reference, details=exc.details),
        status_code=exc.status_code,
        headers=_headers(request, exc.headers),
    )


async def http_exception_handler(request: Request, exc: Exception) -> Response:
    """The ~300 existing ``raise HTTPException(...)`` sites. Same ``detail``
    as before, plus a ``code`` from the status. A 5xx (an upstream failure,
    a misconfiguration) is reported; its ``detail`` was written for the user,
    so it's kept, and binx-web shows the ``reference`` after it."""
    assert isinstance(exc, StarletteHTTPException)
    status_code = exc.status_code
    if status_code in (204, 304):  # no body allowed; mirrors FastAPI's own handler
        return Response(status_code=status_code, headers=_headers(request, exc.headers))
    reference = await _report(request, exc, status_code) if status_code >= 500 else None
    return JSONResponse(
        _body(request, detail=exc.detail, code=code_for_status(status_code), reference=reference),
        status_code=status_code,
        headers=_headers(request, exc.headers),
    )


async def validation_error_handler(request: Request, exc: Exception) -> Response:
    """FastAPI's 422, with the same list-of-errors ``detail`` as before."""
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        _body(request, detail=jsonable_encoder(exc.errors()), code="validation_error"),
        status_code=422,
        headers=_headers(request),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> Response:
    """Anything nobody caught: a real bug. Runs in Starlette's
    ServerErrorMiddleware, which re-raises afterwards so the server still
    logs the traceback (Sentry dedupes that second sighting)."""
    reference = await _report(request, exc, 500)
    return JSONResponse(
        _body(request, detail=INTERNAL_ERROR_MESSAGE, code="internal_error", reference=reference),
        status_code=500,
        headers=_headers(request),
    )


def install_error_handling(app: FastAPI) -> None:
    app.add_middleware(RequestContextMiddleware)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
