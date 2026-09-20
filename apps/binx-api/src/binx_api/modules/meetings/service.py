"""Service layer for scheduling meetings and generating self-service
booking slots. One service, two routers: meetings/router.py (staff) and
client_portal/router.py (portal) both call these same functions — see
invoicing/service.py for the established shape of that dual-surface split.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from binx_api.core.email import send_meeting_cancelled_email, send_meeting_scheduled_email
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_MEETINGS as ACTIVITY_CATEGORY_MEETINGS
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.meetings.models import (
    CREATED_BY_AGENCY_MEMBER,
    MEETING_STATUS_CANCELLED,
    MEETING_STATUS_SCHEDULED,
    AgencyMeetingSettings,
    AvailabilityRule,
    Meeting,
)
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import (
    CATEGORY_MEETINGS,
    EVENT_MEETING_BOOKED,
    EVENT_MEETING_CANCELLED,
    EVENT_MEETING_RESCHEDULED,
    EVENT_MEETING_SCHEDULED,
)
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import User

# ---- Settings ---------------------------------------------------------


async def get_or_create_meeting_settings(db: AsyncSession, agency: Agency) -> AgencyMeetingSettings:
    result = await db.execute(select(AgencyMeetingSettings).where(AgencyMeetingSettings.agency_id == agency.id))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = AgencyMeetingSettings(agency_id=agency.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_meeting_settings(db: AsyncSession, agency: Agency, *, data: dict) -> AgencyMeetingSettings:
    settings = await get_or_create_meeting_settings(db, agency)
    for field, value in data.items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ---- Availability rules ------------------------------------------------


async def list_availability_rules(db: AsyncSession, agency_id: uuid.UUID) -> list[AvailabilityRule]:
    result = await db.execute(
        select(AvailabilityRule)
        .where(AvailabilityRule.agency_id == agency_id)
        .order_by(AvailabilityRule.weekday, AvailabilityRule.start_time)
    )
    return list(result.scalars().all())


async def replace_availability_rules(db: AsyncSession, agency: Agency, *, rules: list[dict]) -> list[AvailabilityRule]:
    """Full replace — the availability editor always submits the whole
    week's rules together, same convention as invoicing's line items."""
    await db.execute(AvailabilityRule.__table__.delete().where(AvailabilityRule.agency_id == agency.id))
    new_rules = [AvailabilityRule(agency_id=agency.id, **rule) for rule in rules]
    db.add_all(new_rules)
    await db.commit()
    return await list_availability_rules(db, agency.id)


# ---- Slot generation -----------------------------------------------------


async def get_available_slots(
    db: AsyncSession,
    agency: Agency,
    *,
    from_date: date,
    to_date: date | None = None,
) -> list[tuple[datetime, datetime]]:
    """Open (starts_at, ends_at) UTC instant pairs for `agency`, covering
    [from_date, to_date] inclusive. `to_date` is always clamped server-side
    to the configured booking window, regardless of what the caller asked
    for. Excludes slots that overlap a non-cancelled Meeting, fall inside
    the booking-notice window from now, or fall outside the window cap.

    Each candidate slot's UTC instant is computed independently (naive local
    datetime -> replace(tzinfo=tz) -> astimezone(UTC)), never by reusing one
    UTC offset for the whole day — that's what keeps DST transition days
    correct, since zoneinfo resolves the right offset per instant.
    """
    settings = await get_or_create_meeting_settings(db, agency)
    tz = ZoneInfo(settings.timezone)

    now_utc = datetime.now(UTC)
    notice_cutoff = now_utc + timedelta(hours=settings.booking_notice_hours)
    today_local = datetime.now(tz).date()
    max_date = today_local + timedelta(days=settings.booking_window_days - 1)
    to_date = min(to_date, max_date) if to_date else max_date
    if from_date > to_date:
        return []

    rules = await list_availability_rules(db, agency.id)
    rules_by_weekday: dict[int, list[AvailabilityRule]] = {}
    for rule in rules:
        rules_by_weekday.setdefault(rule.weekday, []).append(rule)

    # One query for every existing (non-cancelled) meeting in range, rather
    # than one query per day.
    range_start_utc = datetime.combine(from_date, datetime.min.time(), tzinfo=tz).astimezone(UTC)
    range_end_utc = datetime.combine(to_date + timedelta(days=1), datetime.min.time(), tzinfo=tz).astimezone(UTC)
    existing_result = await db.execute(
        select(Meeting.starts_at, Meeting.ends_at).where(
            Meeting.agency_id == agency.id,
            Meeting.status == MEETING_STATUS_SCHEDULED,
            Meeting.starts_at < range_end_utc,
            Meeting.ends_at > range_start_utc,
        )
    )
    existing: list[tuple[datetime, datetime]] = list(existing_result.all())

    slot_length = timedelta(minutes=settings.slot_minutes)
    slots: list[tuple[datetime, datetime]] = []
    day = from_date
    while day <= to_date:
        for rule in rules_by_weekday.get(day.weekday(), []):
            local_start = datetime.combine(day, rule.start_time)
            local_end = datetime.combine(day, rule.end_time)
            slot_start_naive = local_start
            while slot_start_naive + slot_length <= local_end:
                utc_start = slot_start_naive.replace(tzinfo=tz).astimezone(UTC)
                utc_end = utc_start + slot_length
                slot_start_naive += slot_length

                if utc_start < notice_cutoff:
                    continue
                if any(
                    existing_start < utc_end and existing_end > utc_start for existing_start, existing_end in existing
                ):
                    continue
                slots.append((utc_start, utc_end))
        day += timedelta(days=1)

    slots.sort(key=lambda pair: pair[0])
    return slots


# ---- Meetings ------------------------------------------------------------


async def list_meetings(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[tuple[Meeting, str, str | None]]:
    query = (
        select(Meeting, AgencyClient.name, Project.name)
        .join(AgencyClient, AgencyClient.id == Meeting.client_id)
        .outerjoin(Project, Project.id == Meeting.project_id)
        .where(Meeting.agency_id == agency_id)
    )
    if client_id is not None:
        query = query.where(Meeting.client_id == client_id)
    if project_id is not None:
        query = query.where(Meeting.project_id == project_id)
    if status_filter is not None:
        query = query.where(Meeting.status == status_filter)
    if from_date is not None:
        query = query.where(Meeting.starts_at >= datetime.combine(from_date, datetime.min.time(), tzinfo=UTC))
    if to_date is not None:
        query = query.where(
            Meeting.starts_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        )
    query = query.order_by(Meeting.starts_at)

    rows = (await db.execute(query)).all()
    return [(meeting, client_name, project_name) for meeting, client_name, project_name in rows]


async def get_meeting_or_404(db: AsyncSession, agency_id: uuid.UUID, meeting_id: uuid.UUID) -> Meeting:
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id, Meeting.agency_id == agency_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


async def get_meeting_with_names_or_404(
    db: AsyncSession, agency_id: uuid.UUID, meeting_id: uuid.UUID
) -> tuple[Meeting, str, str | None]:
    """Same lookup as get_meeting_or_404, joined with the client/project
    names a MeetingRead response needs — used wherever a single meeting is
    read back after a mutation, so the caller doesn't have to re-derive
    those names by hand."""
    query = (
        select(Meeting, AgencyClient.name, Project.name)
        .join(AgencyClient, AgencyClient.id == Meeting.client_id)
        .outerjoin(Project, Project.id == Meeting.project_id)
        .where(Meeting.id == meeting_id, Meeting.agency_id == agency_id)
    )
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return row


async def book_slot(
    db: AsyncSession,
    agency: Agency,
    client: AgencyClient,
    *,
    starts_at: datetime,
    project_id: uuid.UUID | None,
    title: str,
    notes: str | None,
    location: str | None,
    booked_by: User,
    booked_by_kind: str,
    bypass_notice_window: bool,
) -> Meeting:
    """Books a meeting, guarding against a double-booking race with a
    Postgres transaction-scoped advisory lock keyed on the agency (new
    pattern for this codebase — the existing invoicing `SELECT ... FOR
    UPDATE` numbering lock doesn't transfer here, since a slot has no row to
    lock until it's booked). Staff-created meetings still go through this
    same overlap check (staff shouldn't be able to double-book either) but
    pass bypass_notice_window=True explicitly, since staff can schedule
    same-day/same-hour meetings the portal's notice window would otherwise
    block."""
    settings = await get_or_create_meeting_settings(db, agency)
    ends_at = starts_at + timedelta(minutes=settings.slot_minutes)

    if not bypass_notice_window:
        notice_cutoff = datetime.now(UTC) + timedelta(hours=settings.booking_notice_hours)
        if starts_at < notice_cutoff:
            raise HTTPException(status.HTTP_409_CONFLICT, "That time is inside the booking notice window")

    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:agency_id))"), {"agency_id": str(agency.id)})
    overlap = await db.execute(
        select(Meeting.id).where(
            Meeting.agency_id == agency.id,
            Meeting.status == MEETING_STATUS_SCHEDULED,
            Meeting.starts_at < ends_at,
            Meeting.ends_at > starts_at,
        )
    )
    if overlap.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That time is no longer available — pick another slot")

    meeting = Meeting(
        agency_id=agency.id,
        client_id=client.id,
        project_id=project_id,
        title=title,
        notes=notes,
        location=location,
        starts_at=starts_at,
        ends_at=ends_at,
        created_by_kind=booked_by_kind,
        created_by_user_id=booked_by.id,
        created_by_name=booked_by.full_name,
    )
    db.add(meeting)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That time is no longer available — pick another slot") from None
    await db.refresh(meeting)

    if booked_by_kind == CREATED_BY_AGENCY_MEMBER:
        await _notify_client(
            db,
            agency,
            client,
            meeting,
            event_type=EVENT_MEETING_SCHEDULED,
            title_text=f"New meeting: {meeting.title}",
            body=f"{booked_by.full_name} scheduled a meeting with you.",
            actor=booked_by,
        )
        # Only when staff schedules it — the client already knows when they
        # book it themselves, and staff already gets an in-app notification
        # either way (see _notify_agency below).
        recipient = client.billing_email or client.primary_contact_email
        if recipient:
            await send_meeting_scheduled_email(
                to=recipient,
                agency_name=agency.name,
                title=meeting.title,
                starts_at_local=await _format_local(db, agency, meeting.starts_at),
                location=meeting.location,
            )
    else:
        await _notify_agency(
            db,
            agency,
            meeting,
            event_type=EVENT_MEETING_BOOKED,
            title_text=f"{client.name} booked a meeting",
            body=f"{meeting.title}",
            actor=booked_by,
        )
    verb = "scheduled" if booked_by_kind == CREATED_BY_AGENCY_MEMBER else "booked"
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_MEETINGS,
        event_type=f"meeting_{verb}",
        summary=f"{booked_by.full_name} {verb} a meeting with {client.name}",
        actor=booked_by,
        target_type="meeting",
        target_id=meeting.id,
        target_name=meeting.title,
    )
    return meeting


async def update_meeting(
    db: AsyncSession,
    meeting: Meeting,
    agency: Agency,
    client: AgencyClient,
    *,
    project_id: uuid.UUID | None,
    starts_at: datetime,
    title: str,
    notes: str | None,
    location: str | None,
    updated_by: User,
) -> Meeting:
    """Edits an existing, still-scheduled meeting — title/notes/location/
    project always, and a reschedule when `starts_at` differs from the
    current value. A reschedule re-runs the exact same advisory-lock +
    overlap guard `book_slot` uses (excluding this meeting's own row from
    the overlap check), since moving a meeting can collide with another one
    just as easily as booking a new one can. Only staff can edit — no
    portal-side call site for this."""
    if meeting.status == MEETING_STATUS_CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is cancelled")

    settings = await get_or_create_meeting_settings(db, agency)
    rescheduled = starts_at != meeting.starts_at
    new_ends_at = starts_at + timedelta(minutes=settings.slot_minutes)

    if rescheduled:
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:agency_id))"), {"agency_id": str(agency.id)})
        overlap = await db.execute(
            select(Meeting.id).where(
                Meeting.agency_id == agency.id,
                Meeting.id != meeting.id,
                Meeting.status == MEETING_STATUS_SCHEDULED,
                Meeting.starts_at < new_ends_at,
                Meeting.ends_at > starts_at,
            )
        )
        if overlap.scalar_one_or_none() is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "That time is no longer available — pick another slot")

    meeting.project_id = project_id
    meeting.title = title
    meeting.notes = notes
    meeting.location = location
    meeting.starts_at = starts_at
    meeting.ends_at = new_ends_at

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That time is no longer available — pick another slot") from None
    await db.refresh(meeting)

    if rescheduled:
        await _notify_client(
            db,
            agency,
            client,
            meeting,
            event_type=EVENT_MEETING_RESCHEDULED,
            title_text=f"Meeting rescheduled: {meeting.title}",
            body=f"{updated_by.full_name} moved this meeting to a new time.",
            actor=updated_by,
        )
        # Reuses the "scheduled" email template — same "here's your meeting
        # info" content a client needs after either a fresh booking or a
        # reschedule.
        recipient = client.billing_email or client.primary_contact_email
        if recipient:
            await send_meeting_scheduled_email(
                to=recipient,
                agency_name=agency.name,
                title=meeting.title,
                starts_at_local=await _format_local(db, agency, meeting.starts_at),
                location=meeting.location,
            )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_MEETINGS,
        event_type="meeting_rescheduled" if rescheduled else "meeting_updated",
        summary=(
            f'{updated_by.full_name} rescheduled the meeting "{meeting.title}" with {client.name}'
            if rescheduled
            else f'{updated_by.full_name} updated the meeting "{meeting.title}" with {client.name}'
        ),
        actor=updated_by,
        target_type="meeting",
        target_id=meeting.id,
        target_name=meeting.title,
    )
    return meeting


async def cancel_meeting(
    db: AsyncSession,
    meeting: Meeting,
    agency: Agency,
    client: AgencyClient,
    *,
    cancelled_by: User,
    cancelled_by_kind: str,
) -> Meeting:
    if meeting.status == MEETING_STATUS_CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is already cancelled")

    meeting.status = MEETING_STATUS_CANCELLED
    meeting.cancelled_at = datetime.now(UTC)
    meeting.cancelled_by_kind = cancelled_by_kind
    meeting.cancelled_by_user_id = cancelled_by.id
    meeting.cancelled_by_name = cancelled_by.full_name
    await db.commit()
    await db.refresh(meeting)

    if cancelled_by_kind == CREATED_BY_AGENCY_MEMBER:
        await _notify_client(
            db,
            agency,
            client,
            meeting,
            event_type=EVENT_MEETING_CANCELLED,
            title_text=f"Meeting cancelled: {meeting.title}",
            body=f"{cancelled_by.full_name} cancelled this meeting.",
            actor=cancelled_by,
        )
        recipient = client.billing_email or client.primary_contact_email
        if recipient:
            await send_meeting_cancelled_email(
                to=recipient,
                agency_name=agency.name,
                title=meeting.title,
                starts_at_local=await _format_local(db, agency, meeting.starts_at),
            )
    else:
        await _notify_agency(
            db,
            agency,
            meeting,
            event_type=EVENT_MEETING_CANCELLED,
            title_text=f"{client.name} cancelled a meeting",
            body=f"{meeting.title}",
            actor=cancelled_by,
        )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_MEETINGS,
        event_type="meeting_cancelled",
        summary=f'{cancelled_by.full_name} cancelled the meeting "{meeting.title}" with {client.name}',
        actor=cancelled_by,
        target_type="meeting",
        target_id=meeting.id,
        target_name=meeting.title,
    )
    return meeting


# ---- Notification fan-out helpers ----------------------------------------


async def _notify_client(
    db: AsyncSession,
    agency: Agency,
    client: AgencyClient,
    meeting: Meeting,
    *,
    event_type: str,
    title_text: str,
    body: str,
    actor: User,
) -> None:
    result = await db.execute(select(ClientContact.user_id).where(ClientContact.client_id == client.id))
    recipient_ids = [row[0] for row in result.all()]
    await notifications_service.notify_many(
        db,
        user_ids=recipient_ids,
        category=CATEGORY_MEETINGS,
        event_type=event_type,
        title=title_text,
        body=body,
        link="/portal/meetings",
        agency_id=agency.id,
        actor=actor,
    )


async def _notify_agency(
    db: AsyncSession, agency: Agency, meeting: Meeting, *, event_type: str, title_text: str, body: str, actor: User
) -> None:
    result = await db.execute(select(AgencyMember.user_id).where(AgencyMember.agency_id == agency.id))
    recipient_ids = [row[0] for row in result.all()]
    await notifications_service.notify_many(
        db,
        user_ids=recipient_ids,
        category=CATEGORY_MEETINGS,
        event_type=event_type,
        title=title_text,
        body=body,
        link=f"/meetings/{meeting.id}",
        agency_id=agency.id,
        actor=actor,
    )


async def _format_local(db: AsyncSession, agency: Agency, instant: datetime) -> str:
    """Pre-formats a UTC instant in the agency's own configured timezone,
    for interpolation into an email — core/email.py's meeting functions
    never do their own timezone math, matching the rest of that module's
    convention of taking pre-formatted strings."""
    settings = await get_or_create_meeting_settings(db, agency)
    local = instant.astimezone(ZoneInfo(settings.timezone))
    # %-d/%-I (no leading zero) are GNU-only strftime extensions — not
    # portable to Windows, where this also needs to run. %d/%I with leading
    # zeros work identically everywhere.
    return local.strftime("%A, %B %d, %Y at %I:%M %p %Z")
