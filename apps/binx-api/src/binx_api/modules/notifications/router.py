import uuid

from fastapi import APIRouter, Query, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.notifications import service
from binx_api.modules.notifications.schemas import (
    NotificationListRead,
    NotificationRead,
    UnreadCountRead,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListRead)
async def list_notifications(
    db: DbSession,
    current_user: CurrentUser,
    unread_only: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> NotificationListRead:
    # Fetch one extra to know whether a further page exists without a count query.
    rows = await service.list_notifications(db, current_user, unread_only=unread_only, limit=limit + 1, offset=offset)
    has_more = len(rows) > limit
    return NotificationListRead(
        items=[NotificationRead.model_validate(row) for row in rows[:limit]],
        unread_count=await service.unread_count(db, current_user),
        has_more=has_more,
    )


@router.get("/unread-count", response_model=UnreadCountRead)
async def unread_count(db: DbSession, current_user: CurrentUser) -> UnreadCountRead:
    return UnreadCountRead(unread_count=await service.unread_count(db, current_user))


@router.post("/read-all", response_model=UnreadCountRead)
async def mark_all_read(db: DbSession, current_user: CurrentUser) -> UnreadCountRead:
    await service.mark_all_read(db, current_user)
    return UnreadCountRead(unread_count=0)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(db: DbSession, current_user: CurrentUser, notification_id: uuid.UUID) -> NotificationRead:
    notification = await service.get_notification_or_404(db, current_user, notification_id)
    notification = await service.mark_read(db, notification)
    return NotificationRead.model_validate(notification)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss(db: DbSession, current_user: CurrentUser, notification_id: uuid.UUID) -> None:
    notification = await service.get_notification_or_404(db, current_user, notification_id)
    await service.delete_notification(db, notification)
