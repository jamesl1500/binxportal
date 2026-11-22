"""Reads and triage for the admin error log (/admin/errors). Platform admins
only (see router.py). The write path is store.py."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.modules.errors.models import (
    ERROR_SOURCES,
    STATUS_RESOLVED,
    STATUS_UNRESOLVED,
    ErrorEvent,
    ErrorIssue,
)
from binx_api.modules.users.models import User

settings = get_settings()

# The dashboard's headline windows, in hours.
WINDOWS: dict[str, int] = {"1h": 1, "12h": 12, "24h": 24}
# What the issue list can be scoped to.
PERIODS: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "12h": timedelta(hours=12),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
HOURS_CHARTED = 24
RECENT_EVENTS = 25


def _now() -> datetime:
    return datetime.now(UTC)


def _like(q: str) -> str:
    escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def sentry_link(sentry_event_id: str | None) -> str | None:
    """Deep link to the same event in Sentry (an event id in the issue search
    jumps straight to it). None unless SENTRY_ORG_URL is set."""
    base = settings.sentry_org_url
    if not base or not sentry_event_id:
        return None
    return f"{base.rstrip('/')}/issues/?query={sentry_event_id}"


def _hour(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


async def _hourly(db: AsyncSession, now: datetime, *, issue_id: uuid.UUID | None = None) -> list[dict]:
    """Events per hour for the last 24 hours (the current, partial hour
    last), split by source, with empty hours filled in."""
    first = _hour(now) - timedelta(hours=HOURS_CHARTED - 1)
    bucket = func.date_trunc("hour", ErrorEvent.created_at)
    query = select(bucket, ErrorEvent.source, func.count()).where(ErrorEvent.created_at >= first)
    if issue_id is not None:
        query = query.where(ErrorEvent.issue_id == issue_id)
    rows = await db.execute(query.group_by(bucket, ErrorEvent.source))
    counts: dict[tuple[datetime, str], int] = {(_hour(b), source): int(n) for b, source, n in rows.all()}
    hours = []
    for i in range(HOURS_CHARTED):
        start = first + timedelta(hours=i)
        by_source = {source: counts.get((start, source), 0) for source in ERROR_SOURCES}
        hours.append({"hour_start": start, **by_source, "total": sum(by_source.values())})
    return hours


async def summary(db: AsyncSession, *, now: datetime | None = None) -> dict:
    """The dashboard: how many errors in the last 1, 12 and 24 hours (plus
    the 24 hours before that, for a trend), the hourly chart, and how many
    issues are open."""
    now = now or _now()
    since = {key: now - timedelta(hours=hours) for key, hours in WINDOWS.items()}
    day_before = now - timedelta(hours=48)

    columns: list[Any] = []
    for key in WINDOWS:
        in_window = ErrorEvent.created_at >= since[key]
        columns += [
            func.count().filter(in_window).label(f"events_{key}"),
            func.count(distinct(ErrorEvent.issue_id)).filter(in_window).label(f"issues_{key}"),
            func.count(distinct(ErrorEvent.user_id)).filter(in_window).label(f"users_{key}"),
        ]
    for source in ERROR_SOURCES:
        columns.append(
            func.count().filter(and_(ErrorEvent.created_at >= since["24h"], ErrorEvent.source == source)).label(source)
        )
    columns.append(func.count().filter(ErrorEvent.created_at < since["24h"]).label("previous_24h"))
    row = (await db.execute(select(*columns).where(ErrorEvent.created_at >= day_before))).one()._mapping

    windows = {
        key: {"events": row[f"events_{key}"], "issues": row[f"issues_{key}"], "users": row[f"users_{key}"]}
        for key in WINDOWS
    }
    open_issues = await db.scalar(
        select(func.count())
        .select_from(ErrorIssue)
        .where(ErrorIssue.status == STATUS_UNRESOLVED, ErrorIssue.last_seen_at >= since["24h"])
    )
    new_issues = await db.scalar(
        select(func.count()).select_from(ErrorIssue).where(ErrorIssue.first_seen_at >= since["24h"])
    )
    return {
        "generated_at": now,
        "windows": windows,
        "previous_24h": row["previous_24h"],
        "by_source_24h": {source: row[source] for source in ERROR_SOURCES},
        "open_issues_24h": int(open_issues or 0),
        "new_issues_24h": int(new_issues or 0),
        "hourly": await _hourly(db, now),
    }


async def open_issue_count(db: AsyncSession, *, now: datetime | None = None) -> int:
    """For the admin sidebar badge: unresolved issues seen in the last day."""
    since = (now or _now()) - timedelta(hours=24)
    return int(
        await db.scalar(
            select(func.count())
            .select_from(ErrorIssue)
            .where(ErrorIssue.status == STATUS_UNRESOLVED, ErrorIssue.last_seen_at >= since)
        )
        or 0
    )


def _issue_row(issue: ErrorIssue, events: int, users: int) -> dict:
    return {
        "id": issue.id,
        "source": issue.source,
        "level": issue.level,
        "error_type": issue.error_type,
        "title": issue.title,
        "culprit": issue.culprit,
        "status": issue.status,
        "first_seen_at": issue.first_seen_at,
        "last_seen_at": issue.last_seen_at,
        "event_count": issue.event_count,
        "events_in_period": events,
        "users_in_period": users,
        "last_release": issue.last_release,
        "regressed_at": issue.regressed_at,
        "sentry_url": sentry_link(issue.last_sentry_event_id),
    }


async def list_issues(
    db: AsyncSession,
    *,
    status_: str | None,
    source: str | None,
    period: str,
    sort: str,
    q: str | None,
    limit: int,
    offset: int,
    now: datetime | None = None,
) -> tuple[list[dict], int]:
    """Issues seen within ``period``, with how often (and for how many
    people) each happened in it."""
    since = (now or _now()) - PERIODS[period]
    counts = (
        select(
            ErrorEvent.issue_id.label("issue_id"),
            func.count().label("events"),
            func.count(distinct(ErrorEvent.user_id)).label("users"),
        )
        .where(ErrorEvent.created_at >= since)
        .group_by(ErrorEvent.issue_id)
        .subquery()
    )
    events = func.coalesce(counts.c.events, 0)
    users = func.coalesce(counts.c.users, 0)

    filters = [ErrorIssue.last_seen_at >= since]
    if status_:
        filters.append(ErrorIssue.status == status_)
    if source:
        filters.append(ErrorIssue.source == source)
    if q and q.strip():
        pattern = _like(q)
        filters.append(
            or_(
                ErrorIssue.title.ilike(pattern, escape="\\"),
                ErrorIssue.culprit.ilike(pattern, escape="\\"),
                ErrorIssue.error_type.ilike(pattern, escape="\\"),
            )
        )

    order = {
        "frequent": [events.desc(), ErrorIssue.last_seen_at.desc()],
        "recent": [ErrorIssue.last_seen_at.desc()],
        "new": [ErrorIssue.first_seen_at.desc()],
    }[sort]
    total = await db.scalar(select(func.count()).select_from(ErrorIssue).where(*filters))
    rows = await db.execute(
        select(ErrorIssue, events, users)
        .outerjoin(counts, counts.c.issue_id == ErrorIssue.id)
        .where(*filters)
        .order_by(*order, ErrorIssue.id)
        .limit(limit)
        .offset(offset)
    )
    return [_issue_row(issue, int(n), int(u)) for issue, n, u in rows.all()], int(total or 0)


def _event_row(event: ErrorEvent, *, full: bool) -> dict:
    row = {
        "id": event.id,
        "reference": event.reference,
        "created_at": event.created_at,
        "source": event.source,
        "level": event.level,
        "error_type": event.error_type,
        "message": event.message,
        "request_id": event.request_id,
        "method": event.method,
        "path": event.path,
        "route": event.route,
        "status_code": event.status_code,
        "user_id": event.user_id,
        "agency_id": event.agency_id,
        "release": event.release,
        "environment": event.environment,
        "sentry_url": sentry_link(event.sentry_event_id),
    }
    if full:
        row["stacktrace"] = event.stacktrace
        row["context"] = event.context
    return row


async def get_issue(db: AsyncSession, issue_id: uuid.UUID) -> ErrorIssue:
    issue = await db.get(ErrorIssue, issue_id)
    if issue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Issue not found")
    return issue


async def issue_detail(
    db: AsyncSession, issue_id: uuid.UUID, *, event_id: uuid.UUID | None = None, now: datetime | None = None
) -> dict:
    """One issue: its 24h chart and counts, the latest occurrences, and one
    occurrence in full (``event_id``, else the latest) with its stack."""
    now = now or _now()
    issue = await get_issue(db, issue_id)
    since = now - timedelta(hours=24)
    stats = (
        await db.execute(
            select(func.count(), func.count(distinct(ErrorEvent.user_id))).where(
                ErrorEvent.issue_id == issue.id, ErrorEvent.created_at >= since
            )
        )
    ).one()
    recent = list(
        (
            await db.execute(
                select(ErrorEvent)
                .where(ErrorEvent.issue_id == issue.id)
                .order_by(ErrorEvent.created_at.desc(), ErrorEvent.id)
                .limit(RECENT_EVENTS)
            )
        )
        .scalars()
        .all()
    )

    selected: ErrorEvent | None = None
    if event_id is not None:
        selected = await db.get(ErrorEvent, event_id)
        if selected is None or selected.issue_id != issue.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Occurrence not found")
    elif recent:
        selected = recent[0]

    # Names for the people in the recent list. The ids are snapshots with no
    # FK, so an account may be gone; those just show without a name.
    user_ids = {e.user_id for e in recent if e.user_id} | (
        {selected.user_id} if selected and selected.user_id else set()
    )
    names: dict[uuid.UUID, tuple[str, str]] = {}
    if user_ids:
        for uid, name, email in (
            await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(user_ids)))
        ).all():
            names[uid] = (name, email)

    def with_user(row: dict) -> dict:
        found = names.get(row["user_id"]) if row["user_id"] else None
        return {**row, "user_name": found[0] if found else None, "user_email": found[1] if found else None}

    return {
        "issue": _issue_row(issue, int(stats[0]), int(stats[1])),
        "status_changed_by_name": issue.status_changed_by_name,
        "resolved_at": issue.resolved_at,
        "hourly": await _hourly(db, now, issue_id=issue.id),
        "recent_events": [with_user(_event_row(e, full=False)) for e in recent],
        "event": with_user(_event_row(selected, full=True)) if selected else None,
    }


async def set_status(db: AsyncSession, issue_id: uuid.UUID, *, new_status: str, actor: User) -> ErrorIssue:
    issue = await get_issue(db, issue_id)
    issue.status = new_status
    issue.status_changed_by_id = actor.id
    issue.status_changed_by_name = actor.full_name
    if new_status == STATUS_RESOLVED:
        issue.resolved_at = _now()
        issue.regressed_at = None
    await db.commit()
    await db.refresh(issue)
    return issue


async def lookup(db: AsyncSession, ref: str) -> dict:
    """Finds the occurrence a customer is quoting: the 8-character reference
    from an error message, or a request id from a log or response header."""
    needle = ref.strip()
    if not needle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No error matches that reference")
    event = (
        await db.execute(
            select(ErrorEvent)
            .where(or_(ErrorEvent.reference == needle.upper(), ErrorEvent.request_id == needle))
            .order_by(ErrorEvent.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No error matches that reference")
    return {"issue_id": event.issue_id, "event_id": event.id}
