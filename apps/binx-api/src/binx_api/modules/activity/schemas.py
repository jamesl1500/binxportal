import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ActivityLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    event_type: str
    visibility: str
    summary: str
    actor_name: str | None
    target_type: str | None
    target_name: str | None
    created_at: datetime


class ActivityLogListRead(BaseModel):
    items: list[ActivityLogRead]
    has_more: bool
