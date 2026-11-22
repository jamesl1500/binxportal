import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

IssueStatus = Literal["unresolved", "resolved", "ignored"]


# --- Ingest (binx-web → binx-api) ----------------------------------------------


class WebErrorReport(BaseModel):
    """An error from binx-web: the browser (via binx-web's /api/errors
    route) or the Next server (instrumentation.ts's onRequestError).
    Every field is capped. Anyone can post here, so it's treated as
    untrusted text and only ever shown back as text."""

    model_config = ConfigDict(extra="ignore")

    runtime: Literal["browser", "server"]
    level: Literal["warning", "error", "fatal"] = "error"
    error_type: str = Field(default="Error", min_length=1, max_length=255)
    message: str = Field(max_length=2000)
    stack: str | None = Field(default=None, max_length=20_000)
    path: str | None = Field(default=None, max_length=512)
    route: str | None = Field(default=None, max_length=255)
    route_type: str | None = Field(default=None, max_length=32)
    method: str | None = Field(default=None, max_length=10)
    digest: str | None = Field(default=None, max_length=64)
    release: str | None = Field(default=None, max_length=100)
    environment: str | None = Field(default=None, max_length=32)
    sentry_event_id: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, max_length=512)
    request_id: str | None = Field(default=None, max_length=64)


class WebErrorReceipt(BaseModel):
    # None when the error log is off or the write failed. The page then just
    # doesn't show a reference.
    reference: str | None


# --- Admin ---------------------------------------------------------------------------


class WindowCounts(BaseModel):
    events: int
    issues: int
    users: int


class HourBucket(BaseModel):
    hour_start: datetime
    api: int
    web: int
    total: int


class ErrorSummary(BaseModel):
    generated_at: datetime
    windows: dict[str, WindowCounts]  # "1h" | "12h" | "24h"
    previous_24h: int
    by_source_24h: dict[str, int]
    open_issues_24h: int
    new_issues_24h: int
    hourly: list[HourBucket]


class ErrorIssueRow(BaseModel):
    id: uuid.UUID
    source: str
    level: str
    error_type: str
    title: str
    culprit: str | None
    status: str
    first_seen_at: datetime
    last_seen_at: datetime
    event_count: int
    events_in_period: int
    users_in_period: int
    last_release: str | None
    regressed_at: datetime | None
    sentry_url: str | None


class ErrorIssuePage(BaseModel):
    items: list[ErrorIssueRow]
    total: int


class ErrorEventRow(BaseModel):
    id: uuid.UUID
    reference: str
    created_at: datetime
    source: str
    level: str
    error_type: str
    message: str
    request_id: str | None
    method: str | None
    path: str | None
    route: str | None
    status_code: int | None
    user_id: uuid.UUID | None
    user_name: str | None = None
    user_email: str | None = None
    agency_id: uuid.UUID | None
    release: str | None
    environment: str | None
    sentry_url: str | None


class ErrorEventFull(ErrorEventRow):
    stacktrace: str | None
    context: dict[str, Any] | None


class ErrorIssueDetail(BaseModel):
    issue: ErrorIssueRow  # *_in_period = the last 24 hours
    status_changed_by_name: str | None
    resolved_at: datetime | None
    hourly: list[HourBucket]
    recent_events: list[ErrorEventRow]
    event: ErrorEventFull | None


class ErrorIssueStatusUpdate(BaseModel):
    status: IssueStatus


class ErrorIssueStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    resolved_at: datetime | None
    status_changed_by_name: str | None


class ErrorLookup(BaseModel):
    issue_id: uuid.UUID
    event_id: uuid.UUID


class ErrorBadge(BaseModel):
    open_issues_24h: int
