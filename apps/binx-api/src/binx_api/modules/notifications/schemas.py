import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agency_id: uuid.UUID | None
    category: str
    event_type: str
    title: str
    body: str | None
    link: str | None
    actor_name: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListRead(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    # Whether another page exists past what was returned (offset + limit).
    has_more: bool


class UnreadCountRead(BaseModel):
    unread_count: int
