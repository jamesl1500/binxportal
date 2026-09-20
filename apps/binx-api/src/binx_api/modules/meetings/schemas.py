import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, model_validator

# --- Meeting settings ----------------------------------------------------


class MeetingSettingsRead(BaseModel):
    agency_id: uuid.UUID
    timezone: str
    slot_minutes: int
    booking_notice_hours: int
    booking_window_days: int
    self_booking_enabled: bool


class MeetingSettingsUpdate(BaseModel):
    # Full replace — the settings form always submits every field together.
    timezone: str = Field(min_length=1, max_length=64)
    slot_minutes: int = Field(ge=5, le=480)
    booking_notice_hours: int = Field(ge=0, le=720)
    booking_window_days: int = Field(ge=1, le=365)
    self_booking_enabled: bool = True

    @model_validator(mode="after")
    def _valid_timezone(self) -> "MeetingSettingsUpdate":
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError:
            raise ValueError("Unknown timezone") from None
        return self


class PortalMeetingSettingsRead(BaseModel):
    """Trimmed for the client portal — no admin-only fields (notice/window
    are enforced server-side on booking, not something the client needs to
    read directly to render the calendar)."""

    timezone: str
    slot_minutes: int
    self_booking_enabled: bool


# --- Availability rules --------------------------------------------------


class AvailabilityRuleInput(BaseModel):
    # date.weekday() convention: Monday=0 .. Sunday=6 — NOT JS Date.getDay().
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _start_before_end(self) -> "AvailabilityRuleInput":
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class AvailabilityRuleRead(BaseModel):
    id: uuid.UUID
    weekday: int
    start_time: time
    end_time: time


# --- Slots -----------------------------------------------------------


class SlotRead(BaseModel):
    starts_at: datetime
    ends_at: datetime


# --- Meetings --------------------------------------------------------


class MeetingCreate(BaseModel):
    client_id: uuid.UUID
    project_id: uuid.UUID | None = None
    starts_at: datetime
    title: str = Field(default="Meeting", min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4096)
    location: str | None = Field(default=None, max_length=2048)


class MeetingUpdate(BaseModel):
    # Full replace, same convention as MeetingSettingsUpdate — the edit form
    # always submits every editable field together. client_id isn't here:
    # reassigning a meeting to a different client isn't supported, only
    # editing the details of a meeting for its existing client.
    project_id: uuid.UUID | None = None
    starts_at: datetime
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4096)
    location: str | None = Field(default=None, max_length=2048)


class PortalMeetingCreate(BaseModel):
    project_id: uuid.UUID | None = None
    starts_at: datetime
    title: str = Field(default="Meeting", min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4096)


class MeetingRead(BaseModel):
    # Built by hand — client_name/project_name are joined, not columns.
    id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    project_id: uuid.UUID | None
    project_name: str | None
    title: str
    notes: str | None
    location: str | None
    starts_at: datetime
    ends_at: datetime
    status: str
    created_by_kind: str
    created_by_name: str | None
    cancelled_at: datetime | None
    cancelled_by_kind: str | None
    cancelled_by_name: str | None
    created_at: datetime
