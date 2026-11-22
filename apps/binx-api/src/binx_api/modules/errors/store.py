"""Writes the admin error log: groups each error into an issue and records
the occurrence.

Called from ``core.errors.capture_error`` (API errors) and the ingest
endpoint (binx-web errors). Two rules hold everywhere in here:

* **Its own session.** The request that failed may have left its session
  mid-transaction or broken, so the log never borrows it.
  ``session_factory`` is swapped out under test (see tests/conftest.py).
* **Never raises, never hangs.** Error recording is a side effect of
  something already going wrong. A failure here (the database is what's
  down, say) is logged as a warning and dropped; Sentry still has the error.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
import traceback
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, delete, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException

from binx_api.core.config import get_settings
from binx_api.core.database import async_session_factory
from binx_api.core.errors import AppError, current_request_context
from binx_api.modules.errors.models import (
    SOURCE_API,
    SOURCE_WEB,
    STATUS_RESOLVED,
    STATUS_UNRESOLVED,
    ErrorEvent,
    ErrorIssue,
)
from binx_api.modules.errors.schemas import WebErrorReport

# Warnings only. An ERROR here would be picked up by Sentry's logging
# integration and could loop if Sentry itself is what's failing.
log = logging.getLogger("binx_api.errors.store")
settings = get_settings()

session_factory: Callable[[], AsyncSession] = async_session_factory

WRITE_TIMEOUT_SECONDS = 3.0
PRUNE_EVERY_SECONDS = 3600
MAX_MESSAGE = 2000
MAX_STACK = 20_000
MAX_TITLE = 500

_last_pruned: float | None = None


# --- Fingerprinting ------------------------------------------------------------

_NOISE = [
    (re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I), "<uuid>"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "<email>"),
    (re.compile(r"https?://\S+"), "<url>"),
    (re.compile(r"\b[0-9a-f]{12,}\b", re.I), "<hex>"),
    (re.compile(r"'[^']*'|\"[^\"]*\""), "<str>"),
    (re.compile(r"\d+"), "<n>"),
]


def normalize_message(message: str) -> str:
    """The message with its variable parts (ids, numbers, quoted values)
    replaced, so "Project 1f2e… not found" and "Project 9a8b… not found"
    group together."""
    text = message.strip()[:MAX_MESSAGE]
    for pattern, placeholder in _NOISE:
        text = pattern.sub(placeholder, text)
    return text


def _digest(*parts: str | None) -> str:
    return hashlib.sha256("|".join(p or "" for p in parts).encode()).hexdigest()


def python_culprit(exc: BaseException) -> str | None:
    """ "binx_api.modules.x.service in func": the deepest frame of our own
    code in the traceback, which is where the error should be fixed."""
    frames = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ else []
    for frame in reversed(frames):
        path = frame.filename.replace("\\", "/")
        marker = path.rfind("/binx_api/")
        if marker == -1 or path.endswith(("/core/errors.py", "/core/error_handling.py")):
            continue
        module = path[marker + 1 : -3].replace("/", ".") if path.endswith(".py") else path[marker + 1 :]
        return f"{module} in {frame.name}"[:MAX_TITLE]
    return None


def fingerprint_exception(error_type: str, culprit: str | None, message: str) -> str:
    """Same kind of error raised from the same place is the same issue. With
    no frame of our own to go on, fall back to the normalized message."""
    if culprit:
        return _digest(SOURCE_API, error_type, culprit)
    return _digest(SOURCE_API, error_type, normalize_message(message))


def fingerprint_web(error_type: str, message: str) -> str:
    """Browser bundles are minified and their chunk names change every
    deploy, so a web error is grouped on its type and message alone."""
    return _digest(SOURCE_WEB, error_type, normalize_message(message))


# --- Recording -------------------------------------------------------------------


@dataclass
class Occurrence:
    event_id: uuid.UUID
    reference: str
    fingerprint: str
    source: str
    level: str
    error_type: str
    message: str
    title: str
    culprit: str | None = None
    stacktrace: str | None = None
    request_id: str | None = None
    method: str | None = None
    path: str | None = None
    route: str | None = None
    status_code: int | None = None
    user_id: uuid.UUID | None = None
    agency_id: uuid.UUID | None = None
    release: str | None = None
    environment: str | None = None
    sentry_event_id: str | None = None
    context: dict[str, Any] | None = None


def _message_of(exc: BaseException) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    if isinstance(exc, AppError):
        return exc.message
    return str(exc) or type(exc).__name__


def _stack_of(exc: BaseException) -> str:
    # Keep the tail. The exception actually raised prints last, after any
    # "The above exception was the direct cause..." chain.
    return "".join(traceback.format_exception(exc))[-MAX_STACK:]


async def record_exception(
    exc: BaseException,
    *,
    event_id: uuid.UUID,
    reference: str,
    level: str,
    sentry_event_id: str | None,
    status_code: int | None = None,
    route: str | None = None,
    context: Mapping[str, Any] | None = None,
) -> None:
    """Records a Python exception raised in this process."""
    if not settings.error_store_enabled:
        return
    try:
        ctx = current_request_context()
        error_type = type(exc).__name__
        message = _message_of(exc)[:MAX_MESSAGE]
        culprit = python_culprit(exc)
        merged = {**(ctx.extra if ctx else {}), **(context or {})}
        occurrence = Occurrence(
            event_id=event_id,
            reference=reference,
            fingerprint=fingerprint_exception(error_type, culprit, message),
            source=SOURCE_API,
            level=level,
            error_type=error_type,
            message=message,
            title=message[:MAX_TITLE],
            culprit=culprit,
            stacktrace=_stack_of(exc),
            request_id=ctx.request_id if ctx else None,
            method=ctx.method if ctx else None,
            path=ctx.path if ctx else None,
            route=route,
            status_code=status_code,
            user_id=ctx.user_id if ctx else None,
            agency_id=ctx.agency_id if ctx else None,
            release=settings.sentry_release,
            environment=settings.sentry_environment,
            sentry_event_id=sentry_event_id,
            context=_jsonable(merged) or None,
        )
    except Exception:  # noqa: BLE001 - see the module docstring
        log.warning("Couldn't build an error-log entry for %s", type(exc).__name__, exc_info=True)
        return
    await write(occurrence)


async def record_web_report(
    report: WebErrorReport, *, event_id: uuid.UUID, reference: str, user_id: uuid.UUID | None
) -> bool:
    """Records an error binx-web reported. True if stored."""
    if not settings.error_store_enabled:
        return False
    message = report.message.strip()[:MAX_MESSAGE] or report.error_type
    route = report.route
    return await write(
        Occurrence(
            event_id=event_id,
            reference=reference,
            fingerprint=fingerprint_web(report.error_type, message),
            source=SOURCE_WEB,
            level=report.level,
            error_type=report.error_type,
            message=message,
            title=message[:MAX_TITLE],
            # The page route is the most useful "where" a minified bundle
            # offers. The fingerprint leaves it out (same bug, many pages).
            culprit=(f"{route} ({report.runtime})" if route else f"({report.runtime})")[:MAX_TITLE],
            stacktrace=report.stack[-MAX_STACK:] if report.stack else None,
            request_id=report.request_id,
            method=report.method,
            path=report.path,
            route=route,
            user_id=user_id,
            release=report.release,
            environment=report.environment,
            sentry_event_id=report.sentry_event_id,
            context=_jsonable(
                {
                    "runtime": report.runtime,
                    "route_type": report.route_type,
                    "digest": report.digest,
                    "user_agent": report.user_agent,
                }
            ),
        )
    )


def _jsonable(value: Mapping[str, Any]) -> dict[str, Any]:
    """Context is caller-supplied. Anything JSON can't hold becomes its repr
    rather than failing the write."""
    out: dict[str, Any] = {}
    for key, item in value.items():
        if item is None or isinstance(item, str | int | float | bool):
            out[str(key)] = item
        elif isinstance(item, list | tuple) and all(isinstance(i, str | int | float | bool) for i in item):
            out[str(key)] = list(item)
        else:
            out[str(key)] = str(item)[:500]
    return out


async def write(occurrence: Occurrence, *, now: datetime | None = None) -> bool:
    """Upserts the issue and inserts the occurrence. True if it was stored."""
    try:
        await asyncio.wait_for(_write(occurrence, now or datetime.now(UTC)), timeout=WRITE_TIMEOUT_SECONDS)
        return True
    except Exception:  # noqa: BLE001 - see the module docstring
        log.warning("Couldn't store error %s in the error log", occurrence.reference, exc_info=True)
        return False


async def _write(occurrence: Occurrence, now: datetime) -> None:
    async with session_factory() as db:
        issue_id = await _upsert_issue(db, occurrence, now)
        db.add(
            ErrorEvent(
                id=occurrence.event_id,
                issue_id=issue_id,
                reference=occurrence.reference,
                source=occurrence.source,
                level=occurrence.level,
                error_type=occurrence.error_type[:255],
                message=occurrence.message,
                stacktrace=occurrence.stacktrace,
                request_id=occurrence.request_id,
                method=occurrence.method,
                path=(occurrence.path or None) and occurrence.path[:512],
                route=(occurrence.route or None) and occurrence.route[:255],
                status_code=occurrence.status_code,
                user_id=occurrence.user_id,
                agency_id=occurrence.agency_id,
                environment=occurrence.environment,
                release=occurrence.release,
                sentry_event_id=occurrence.sentry_event_id,
                context=occurrence.context,
                created_at=now,
            )
        )
        await db.commit()
        await _maybe_prune(db, now)


async def _upsert_issue(db: AsyncSession, occurrence: Occurrence, now: datetime) -> uuid.UUID:
    """One statement, so two workers hitting a brand-new error at the same
    moment both land on the same issue instead of racing to create it."""
    was_resolved = ErrorIssue.status == STATUS_RESOLVED
    insert = pg_insert(ErrorIssue).values(
        id=uuid.uuid4(),
        fingerprint=occurrence.fingerprint,
        source=occurrence.source,
        level=occurrence.level,
        error_type=occurrence.error_type[:255],
        title=occurrence.title[:MAX_TITLE] or occurrence.error_type[:255],
        culprit=occurrence.culprit,
        status=STATUS_UNRESOLVED,
        first_seen_at=now,
        last_seen_at=now,
        event_count=1,
        last_release=occurrence.release,
        last_sentry_event_id=occurrence.sentry_event_id,
        created_at=now,
        updated_at=now,
    )
    upsert = insert.on_conflict_do_update(
        index_elements=[ErrorIssue.fingerprint],
        set_={
            # GREATEST/LEAST, not plain assignment: occurrences can be
            # written out of order (a browser report that arrives late).
            "last_seen_at": func.greatest(ErrorIssue.last_seen_at, now),
            "first_seen_at": func.least(ErrorIssue.first_seen_at, now),
            "updated_at": now,
            "event_count": ErrorIssue.event_count + 1,
            "level": insert.excluded.level,
            "last_release": func.coalesce(insert.excluded.last_release, ErrorIssue.last_release),
            "last_sentry_event_id": func.coalesce(
                insert.excluded.last_sentry_event_id, ErrorIssue.last_sentry_event_id
            ),
            # A fix that didn't hold: back on the list, flagged.
            "status": case((was_resolved, STATUS_UNRESOLVED), else_=ErrorIssue.status),
            "regressed_at": case((was_resolved, now), else_=ErrorIssue.regressed_at),
        },
    ).returning(ErrorIssue.id)
    return (await db.execute(upsert)).scalar_one()


async def _maybe_prune(db: AsyncSession, now: datetime) -> None:
    """Drops occurrences past the retention window, at most hourly per
    process. There's no scheduler in this app, so this runs from the write
    path, much like recurring invoices catch up on page load."""
    global _last_pruned
    tick = time.monotonic()
    if _last_pruned is not None and tick - _last_pruned < PRUNE_EVERY_SECONDS:
        return
    _last_pruned = tick
    cutoff = now - timedelta(days=settings.error_retention_days)
    await db.execute(delete(ErrorEvent).where(ErrorEvent.created_at < cutoff))
    await db.commit()
