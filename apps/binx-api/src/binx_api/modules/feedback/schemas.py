import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

_SURFACE_PATTERN = "^(app|portal)$"
# "pulse" is deliberately not accepted here — check-in answers go through
# POST /feedback/pulse/{key}, which records the milestone too.
_KIND_PATTERN = "^(bug|idea|praise|other)$"
_STATUS_PATTERN = "^(new|in_review|planned|done|declined)$"

MESSAGE_MAX = 5000


class FeedbackCreate(BaseModel):
    surface: str = Field(pattern=_SURFACE_PATTERN)
    # The agency the staff member is working in. Ignored for the portal
    # surface, where the context comes from the caller's client membership.
    agency_id: uuid.UUID | None = None
    kind: str = Field(pattern=_KIND_PATTERN)
    rating: int | None = Field(default=None, ge=1, le=5)
    message: str = Field(min_length=1, max_length=MESSAGE_MAX)
    allow_contact: bool = True
    page_path: str | None = Field(default=None, max_length=512)
    user_agent: str | None = Field(default=None, max_length=512)
    viewport: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def _message_not_blank(self) -> "FeedbackCreate":
        if not self.message.strip():
            raise ValueError("Tell us a little about it")
        return self


class FeedbackPulseAnswer(BaseModel):
    surface: str = Field(pattern=_SURFACE_PATTERN)
    agency_id: uuid.UUID | None = None
    rating: int = Field(ge=1, le=5)
    message: str = Field(default="", max_length=MESSAGE_MAX)
    page_path: str | None = Field(default=None, max_length=512)
    user_agent: str | None = Field(default=None, max_length=512)
    viewport: str | None = Field(default=None, max_length=32)


class FeedbackPulseRead(BaseModel):
    """The check-in milestone to ask about right now, or ``None``."""

    pulse_key: str | None


class FeedbackRead(BaseModel):
    """The submitter's own view — no internal note, no other people's data."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    surface: str
    kind: str
    rating: int | None
    message: str
    page_path: str | None
    status: str
    response: str | None
    responded_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime


class FeedbackAdminRead(FeedbackRead):
    user_id: uuid.UUID | None
    user_name: str
    user_email: str
    agency_id: uuid.UUID | None
    agency_name: str | None = None
    client_id: uuid.UUID | None
    client_name: str | None = None
    pulse_key: str | None
    user_agent: str | None
    viewport: str | None
    allow_contact: bool
    internal_note: str | None
    updated_at: datetime | None


class FeedbackAdminList(BaseModel):
    items: list[FeedbackAdminRead]
    total: int


class FeedbackAdminUpdate(BaseModel):
    """Partial: only the fields sent are changed. An empty string clears
    ``response`` / ``internal_note``."""

    status: str | None = Field(default=None, pattern=_STATUS_PATTERN)
    response: str | None = Field(default=None, max_length=MESSAGE_MAX)
    internal_note: str | None = Field(default=None, max_length=MESSAGE_MAX)


class FeedbackSummary(BaseModel):
    by_status: dict[str, int]
    by_kind: dict[str, int]
    by_surface: dict[str, int]
    open_total: int
    # Over the last 30 days. ``None`` when nothing rated was submitted.
    avg_rating_30d: float | None
    rated_30d: int
    # The check-in prompt specifically: average score and answer rate.
    pulse_avg_rating: float | None
    pulse_answered: int
    pulse_dismissed: int
