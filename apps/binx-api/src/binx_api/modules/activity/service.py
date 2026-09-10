"""Service layer for the activity / audit log.

Two independent feeds share one table:

- **Agency activity** (``SCOPE_AGENCY``) — team/client/project/invoicing/
  settings events, agency-wide. Most entries are visible to every member;
  a handful of sensitive event types (role changes, removals, billing) are
  written with ``VISIBILITY_ADMIN`` and filtered out for non-admin viewers.
- **Account activity** (``SCOPE_ACCOUNT``) — a user's own security history
  (sign-ins, password/email changes). Never agency business, never shown to
  anyone but the account it belongs to.

Producers elsewhere in the codebase call :func:`log_agency_activity` /
:func:`log_account_activity` after their own work has committed, the same
"fire and forget, never block the action" contract as
``notifications/service.py``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity.models import (
    CATEGORY_SECURITY,
    SCOPE_ACCOUNT,
    SCOPE_AGENCY,
    VISIBILITY_ADMIN,
    ActivityLog,
)
from binx_api.modules.users.models import User


async def log_agency_activity(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    category: str,
    event_type: str,
    summary: str,
    visibility: str = "team",
    actor: User | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    target_name: str | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        scope=SCOPE_AGENCY,
        agency_id=agency_id,
        category=category,
        event_type=event_type,
        visibility=visibility,
        summary=summary,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else None,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        created_at=datetime.now(UTC),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def log_account_activity(
    db: AsyncSession,
    user: User,
    *,
    event_type: str,
    summary: str,
    actor: User | None = None,
) -> ActivityLog:
    """Records a personal security event for ``user`` (a sign-in, a password
    or email change). ``actor`` is almost always ``user`` themself; it's a
    separate parameter only so an admin-initiated action on someone's account
    could attribute correctly in the future."""
    entry = ActivityLog(
        scope=SCOPE_ACCOUNT,
        subject_user_id=user.id,
        category=CATEGORY_SECURITY,
        event_type=event_type,
        summary=summary,
        actor_id=(actor or user).id,
        actor_name=(actor or user).full_name,
        created_at=datetime.now(UTC),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def list_agency_activity(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    viewer_is_admin: bool,
    category: str | None = None,
    limit: int = 30,
    offset: int = 0,
) -> list[ActivityLog]:
    query = select(ActivityLog).where(ActivityLog.scope == SCOPE_AGENCY, ActivityLog.agency_id == agency_id)
    if not viewer_is_admin:
        query = query.where(ActivityLog.visibility != VISIBILITY_ADMIN)
    if category is not None:
        query = query.where(ActivityLog.category == category)
    query = query.order_by(ActivityLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def list_account_activity(db: AsyncSession, user: User, *, limit: int = 30, offset: int = 0) -> list[ActivityLog]:
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.scope == SCOPE_ACCOUNT, ActivityLog.subject_user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
