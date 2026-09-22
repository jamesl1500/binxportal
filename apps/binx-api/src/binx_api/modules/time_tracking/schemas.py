import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class TimerStart(BaseModel):
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=1024)
    is_billable: bool = True


class ManualEntryCreate(BaseModel):
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=1024)
    started_at: datetime
    ended_at: datetime
    is_billable: bool = True
    hourly_rate_cents: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _ends_after_start(self) -> "ManualEntryCreate":
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at must be after started_at")
        return self


class TimeEntryUpdate(BaseModel):
    # Only editable while the entry isn't invoiced yet — see
    # service._require_not_invoiced. A running entry (ended_at null) can only
    # have its description/billable flag touched here; stop it to set times.
    description: str | None = Field(default=None, max_length=1024)
    task_id: uuid.UUID | None = None
    is_billable: bool = True
    hourly_rate_cents: int | None = Field(default=None, ge=0)
    started_at: datetime | None = None
    ended_at: datetime | None = None


class TimeEntryRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    task_id: uuid.UUID | None
    task_title: str | None
    user_id: uuid.UUID
    user_name: str
    description: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: int
    is_billable: bool
    hourly_rate_cents: int | None
    amount_cents: int | None
    invoiced: bool
    created_at: datetime


class UninvoicedSummaryRead(BaseModel):
    entry_count: int
    total_minutes: int
    # Only entries with a resolvable rate (own override or the project's
    # default) count toward this — see service.uninvoiced_summary.
    billable_amount_cents: int
    unrated_entry_count: int
