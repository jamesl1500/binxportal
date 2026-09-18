import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Time, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

MEETING_STATUS_SCHEDULED = "scheduled"
MEETING_STATUS_CANCELLED = "cancelled"

meeting_statuses: list[str] = [MEETING_STATUS_SCHEDULED, MEETING_STATUS_CANCELLED]

# Same vocabulary as projects/models.py's AUTHOR_AGENCY_MEMBER / AUTHOR_CLIENT
# (ProjectTaskComment's "who did this" discriminator) — reused here rather
# than inventing a new "staff"/"client" pair.
CREATED_BY_AGENCY_MEMBER = "agency_member"
CREATED_BY_CLIENT = "client"

created_by_kinds: list[str] = [CREATED_BY_AGENCY_MEMBER, CREATED_BY_CLIENT]


# One row per agency, created lazily on first access — same pattern as
# invoicing/models.py's AgencyBillingSettings. Scheduling defaults; the
# actual weekly hours live in AvailabilityRule.
class AgencyMeetingSettings(Base):
    __tablename__ = "agency_meeting_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, index=True)

    # IANA zone name (e.g. "America/New_York"). Every AvailabilityRule's
    # start_time/end_time is interpreted in this zone; slots are generated
    # and stored as UTC instants (see meetings/service.py::get_available_slots).
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    slot_minutes: Mapped[int] = mapped_column(Integer, default=30)
    booking_notice_hours: Mapped[int] = mapped_column(Integer, default=24)
    booking_window_days: Mapped[int] = mapped_column(Integer, default=30)
    # Kill switch: turns off client self-booking through the portal without
    # deleting the availability rules — staff can still schedule manually.
    self_booking_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


# A recurring weekly availability block. Multiple rows per agency/weekday are
# allowed (e.g. 9-12 and 13-17 the same day, for a lunch break). weekday
# follows Python's date.weekday() convention: Monday=0 .. Sunday=6 — NOT
# JavaScript's Date.getDay() (Sunday=0) — the frontend day picker must
# convert explicitly rather than assume they match.
class AvailabilityRule(Base):
    __tablename__ = "availability_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(SmallInteger)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)


# A scheduled meeting between the agency and a client — either staff-scheduled
# or booked by the client through the portal's self-service flow (see
# created_by_kind). client_id has no ondelete: a client with meetings can't
# be deleted out from under them, same rule as Invoice.client_id and
# Project.client_id. A ClientContact is just a User plus a join row
# (client_portal/models.py), so a single users.id FK covers "who did this"
# whether they're staff or a client contact.
class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (Index("ix_meetings_agency_id_starts_at", "agency_id", "starts_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), default=None, index=True
    )

    title: Mapped[str] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(String(4096), default=None)
    # Free text — a pasted Zoom/Meet link, a physical address, "phone call".
    # No video-conferencing integration in this pass.
    location: Mapped[str | None] = mapped_column(String(2048), default=None)

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default=MEETING_STATUS_SCHEDULED)

    # Who booked it — the same "kind + user + name snapshot" triad as
    # ProjectTaskComment's author_type/author_user_id/author_name, so
    # history still reads correctly after the person leaves the agency.
    created_by_kind: Mapped[str] = mapped_column(String(20), default=CREATED_BY_AGENCY_MEMBER)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    created_by_name: Mapped[str | None] = mapped_column(String(255), default=None)

    # Same triad again for cancellation — either side can cancel.
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    cancelled_by_kind: Mapped[str | None] = mapped_column(String(20), default=None)
    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    cancelled_by_name: Mapped[str | None] = mapped_column(String(255), default=None)
