"""Service layer for in-app notifications.

Notifications are per-recipient and cross-agency. Producers elsewhere in the
codebase call :func:`notify` / :func:`notify_many` after their own work has
committed — a suppressed or failed notification never rolls back the action
that triggered it. Each recipient's ``UserNotificationSettings.inapp_<category>``
toggle is honoured here: a muted category is dropped silently.

Also pushed live over the recipient's websocket (see messaging/realtime.py —
the same generic per-user event stream messages/boards already use), so the
header bell can toast it immediately instead of waiting for its poll.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.messaging import realtime
from binx_api.modules.notifications.models import Notification
from binx_api.modules.notifications.schemas import NotificationRead
from binx_api.modules.users.models import User, UserNotificationSettings

# Category -> the settings column that mutes it.
_MUTE_COLUMN = {
    "team": UserNotificationSettings.inapp_team,
    "invoicing": UserNotificationSettings.inapp_invoicing,
    "projects": UserNotificationSettings.inapp_projects,
    "messages": UserNotificationSettings.inapp_messages,
}


async def _muted_user_ids(db: AsyncSession, user_ids: Iterable[uuid.UUID], category: str) -> set[uuid.UUID]:
    """The subset of ``user_ids`` that have switched this category off. A user
    with no settings row isn't muted (the toggles default on)."""
    column = _MUTE_COLUMN.get(category)
    if column is None:
        return set()
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return set()
    result = await db.execute(
        select(UserNotificationSettings.user_id).where(
            UserNotificationSettings.user_id.in_(ids),
            column.is_(False),
        )
    )
    return set(result.scalars().all())


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    category: str,
    event_type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    agency_id: uuid.UUID | None = None,
    actor: User | None = None,
) -> Notification | None:
    """Store one notification for one recipient, unless they've muted the
    category. Commits. Returns the row (or ``None`` when suppressed)."""
    created = await notify_many(
        db,
        user_ids=[user_id],
        category=category,
        event_type=event_type,
        title=title,
        body=body,
        link=link,
        agency_id=agency_id,
        actor=actor,
    )
    return created[0] if created else None


async def notify_many(
    db: AsyncSession,
    *,
    user_ids: Iterable[uuid.UUID],
    category: str,
    event_type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    agency_id: uuid.UUID | None = None,
    actor: User | None = None,
) -> list[Notification]:
    """Fan one notification out to several recipients. The actor is never
    notified about their own action. Commits once. Returns the stored rows."""
    recipients = [uid for uid in dict.fromkeys(user_ids) if actor is None or uid != actor.id]
    if not recipients:
        return []

    muted = await _muted_user_ids(db, recipients, category)
    rows = [
        Notification(
            user_id=uid,
            agency_id=agency_id,
            category=category,
            event_type=event_type,
            title=title,
            body=body,
            link=link,
            actor_id=actor.id if actor else None,
            actor_name=actor.full_name if actor else None,
        )
        for uid in recipients
        if uid not in muted
    ]
    if not rows:
        return []

    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)

    # Real-time push, after commit — same "fire and forget" contract as the
    # write itself. A dropped/offline socket just means the recipient sees it
    # on their next poll/page load instead of instantly.
    for row in rows:
        await realtime.manager.send_to_users(
            [row.user_id],
            {
                "type": realtime.EVENT_NOTIFICATION_CREATED,
                "data": NotificationRead.model_validate(row).model_dump(mode="json"),
            },
        )
    return rows


async def list_notifications(
    db: AsyncSession,
    user: User,
    *,
    unread_only: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> list[Notification]:
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def unread_count(db: AsyncSession, user: User) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return result.scalar_one()


async def get_notification_or_404(db: AsyncSession, user: User, notification_id: uuid.UUID) -> Notification:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    return notification


async def mark_read(db: AsyncSession, notification: Notification) -> Notification:
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(notification)
    return notification


async def mark_all_read(db: AsyncSession, user: User) -> int:
    """Marks every unread notification read. Returns how many were updated."""
    now = datetime.now(UTC)
    result = await db.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    rows = list(result.scalars().all())
    for row in rows:
        row.read_at = now
    await db.commit()
    return len(rows)


async def delete_notification(db: AsyncSession, notification: Notification) -> None:
    await db.delete(notification)
    await db.commit()
