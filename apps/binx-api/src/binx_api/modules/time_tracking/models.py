"""Time tracking: billable/non-billable time logged against a project (and
optionally one of its tasks), feeding invoicing/service.py's
"generate an invoice from time entries" flow. A running timer is a TimeEntry
with ``ended_at`` still null; ``duration_minutes`` is only ever written when
it's stopped (see service.py::stop_timer) — a running entry's live elapsed
time is a frontend computation from ``started_at``, not a stored column.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    # SET NULL, not CASCADE: deleting a task shouldn't destroy the billing
    # history of time already logged against it — the entry just becomes
    # task-less, same as ProjectTask.assignee_id.
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_tasks.id", ondelete="SET NULL"), default=None, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    description: Mapped[str | None] = mapped_column(String(1024), default=None)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    # Null while the timer is running. Set (with duration_minutes) by
    # service.stop_timer or immediately by service.log_manual_entry.
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=True)
    # Snapshotted at stop/log time from the per-entry override or the
    # project's default_hourly_rate_cents — see service.resolve_hourly_rate_cents
    # — so a later change to the project's rate never reprices old entries.
    hourly_rate_cents: Mapped[int | None] = mapped_column(Integer, default=None)
    # Set once this entry has been billed onto an invoice line item — an
    # invoiced entry is locked (see service._require_not_invoiced). SET NULL
    # so voiding/deleting the invoice line frees the entry to be re-billed.
    invoice_line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invoice_line_items.id", ondelete="SET NULL"), default=None, index=True
    )
