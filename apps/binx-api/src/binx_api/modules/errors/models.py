"""The admin error log: every unexpected error, grouped into issues.

An ``ErrorIssue`` is one distinct problem (same kind of error, same place);
an ``ErrorEvent`` is each time it happened. Sentry has the same model and
stays the place for deep debugging. This copy lives next to the rest of the
platform data so the Binx admin console (/admin/errors) can count, trend and
triage errors without a Sentry login, and can work with Sentry off entirely.

Written only by ``store.py``, always in its own session, because the request
that failed may have left its own session unusable.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Where the error happened. "web" covers binx-web, both the browser and the
# Next server (the event's context says which).
SOURCE_API = "api"
SOURCE_WEB = "web"
ERROR_SOURCES: list[str] = [SOURCE_API, SOURCE_WEB]

LEVEL_ERROR = "error"
LEVEL_WARNING = "warning"
LEVEL_FATAL = "fatal"
ERROR_LEVELS: list[str] = [LEVEL_WARNING, LEVEL_ERROR, LEVEL_FATAL]

# Triage. A resolved issue that happens again goes back to unresolved and is
# marked regressed. An ignored one stays ignored but keeps counting.
STATUS_UNRESOLVED = "unresolved"
STATUS_RESOLVED = "resolved"
STATUS_IGNORED = "ignored"
ISSUE_STATUSES: list[str] = [STATUS_UNRESOLVED, STATUS_RESOLVED, STATUS_IGNORED]


class ErrorIssue(Base):
    __tablename__ = "error_issues"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # sha256 of what makes two errors "the same" (see store.fingerprint_*).
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)

    source: Mapped[str] = mapped_column(String(16), index=True)
    level: Mapped[str] = mapped_column(String(16), default=LEVEL_ERROR)
    error_type: Mapped[str] = mapped_column(String(255))
    # The first message seen. Later ones can differ in their ids/numbers,
    # which the fingerprint deliberately ignores.
    title: Mapped[str] = mapped_column(String(500))
    # Where: "binx_api.modules.invoicing.service in send_invoice", or a page
    # route for web errors.
    culprit: Mapped[str | None] = mapped_column(String(500), default=None)

    status: Mapped[str] = mapped_column(String(16), default=STATUS_UNRESOLVED, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # Lifetime total. Unlike the event rows, it survives retention pruning.
    event_count: Mapped[int] = mapped_column(Integer, default=1)
    last_release: Mapped[str | None] = mapped_column(String(100), default=None)
    last_sentry_event_id: Mapped[str | None] = mapped_column(String(64), default=None)

    # Set when a resolved issue comes back; cleared on the next resolve.
    regressed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    status_changed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    status_changed_by_name: Mapped[str | None] = mapped_column(String(255), default=None)


class ErrorEvent(Base):
    __tablename__ = "error_events"
    __table_args__ = (Index("ix_error_events_issue_id_created_at", "issue_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    issue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("error_issues.id", ondelete="CASCADE"))
    # new_reference(id): what the customer saw ("Reference: 7F3A9C21").
    reference: Mapped[str] = mapped_column(String(16), index=True)

    source: Mapped[str] = mapped_column(String(16))
    level: Mapped[str] = mapped_column(String(16), default=LEVEL_ERROR)
    error_type: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, default="")
    stacktrace: Mapped[str | None] = mapped_column(Text, default=None)

    request_id: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    method: Mapped[str | None] = mapped_column(String(10), default=None)
    path: Mapped[str | None] = mapped_column(String(512), default=None)
    # The route template ("/agencies/{agency_id}/invoices") rather than the
    # concrete path, so occurrences can be compared.
    route: Mapped[str | None] = mapped_column(String(255), default=None)
    status_code: Mapped[int | None] = mapped_column(Integer, default=None)

    # Snapshots with no FK: an error from an account that's later deleted is
    # still an error, and a web report can name a user the API can't verify.
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, default=None, index=True)
    agency_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, default=None)

    environment: Mapped[str | None] = mapped_column(String(32), default=None)
    release: Mapped[str | None] = mapped_column(String(100), default=None)
    sentry_event_id: Mapped[str | None] = mapped_column(String(64), default=None)
    # Anything else worth showing (user agent, Next digest, the context a
    # capture_error caller passed).
    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    # Overrides Base's nullable column: every count and chart is keyed on it.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
