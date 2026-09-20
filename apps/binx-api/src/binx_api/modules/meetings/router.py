"""Staff-side meeting scheduling endpoints — settings, recurring
availability rules, slot preview, and meeting CRUD. The client-portal
booking flow lives in client_portal/router.py and imports service.py /
_meeting_read directly, rather than duplicating this logic — see
invoicing/router.py + client_portal/router.py for the established shape of
that dual-surface split.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.agencies.service import get_client_or_404
from binx_api.modules.meetings import service
from binx_api.modules.meetings.models import CREATED_BY_AGENCY_MEMBER, Meeting
from binx_api.modules.meetings.schemas import (
    AvailabilityRuleInput,
    AvailabilityRuleRead,
    MeetingCreate,
    MeetingRead,
    MeetingSettingsRead,
    MeetingSettingsUpdate,
    MeetingUpdate,
    SlotRead,
)

router = APIRouter(prefix="/agencies/{agency_id}", tags=["meetings"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _meeting_read(meeting: Meeting, client_name: str, project_name: str | None) -> MeetingRead:
    return MeetingRead(
        id=meeting.id,
        agency_id=meeting.agency_id,
        client_id=meeting.client_id,
        client_name=client_name,
        project_id=meeting.project_id,
        project_name=project_name,
        title=meeting.title,
        notes=meeting.notes,
        location=meeting.location,
        starts_at=meeting.starts_at,
        ends_at=meeting.ends_at,
        status=meeting.status,
        created_by_kind=meeting.created_by_kind,
        created_by_name=meeting.created_by_name,
        cancelled_at=meeting.cancelled_at,
        cancelled_by_kind=meeting.cancelled_by_kind,
        cancelled_by_name=meeting.cancelled_by_name,
        created_at=meeting.created_at,
    )


@router.get("/meeting-settings", response_model=MeetingSettingsRead)
async def read_meeting_settings(db: DbSession, agency_and_role: AnyMember) -> MeetingSettingsRead:
    agency, _role = agency_and_role
    return MeetingSettingsRead.model_validate(
        await service.get_or_create_meeting_settings(db, agency), from_attributes=True
    )


@router.patch("/meeting-settings", response_model=MeetingSettingsRead)
async def write_meeting_settings(
    db: DbSession, agency_and_role: AgencyAndRole, data: MeetingSettingsUpdate
) -> MeetingSettingsRead:
    agency, _role = agency_and_role
    settings = await service.update_meeting_settings(db, agency, data=data.model_dump())
    return MeetingSettingsRead.model_validate(settings, from_attributes=True)


@router.get("/availability-rules", response_model=list[AvailabilityRuleRead])
async def read_availability_rules(db: DbSession, agency_and_role: AnyMember) -> list[AvailabilityRuleRead]:
    agency, _role = agency_and_role
    rules = await service.list_availability_rules(db, agency.id)
    return [AvailabilityRuleRead.model_validate(rule, from_attributes=True) for rule in rules]


@router.put("/availability-rules", response_model=list[AvailabilityRuleRead])
async def write_availability_rules(
    db: DbSession, agency_and_role: AgencyAndRole, data: list[AvailabilityRuleInput]
) -> list[AvailabilityRuleRead]:
    agency, _role = agency_and_role
    rules = await service.replace_availability_rules(db, agency, rules=[rule.model_dump() for rule in data])
    return [AvailabilityRuleRead.model_validate(rule, from_attributes=True) for rule in rules]


@router.get("/meetings/slots", response_model=list[SlotRead])
async def read_available_slots(
    db: DbSession,
    agency_and_role: AnyMember,
    from_date: date = Query(...),
    to_date: date | None = Query(default=None),
) -> list[SlotRead]:
    agency, _role = agency_and_role
    slots = await service.get_available_slots(db, agency, from_date=from_date, to_date=to_date)
    return [SlotRead(starts_at=starts_at, ends_at=ends_at) for starts_at, ends_at in slots]


@router.get("/meetings", response_model=list[MeetingRead])
async def list_meetings(
    db: DbSession,
    agency_and_role: AnyMember,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[MeetingRead]:
    agency, _role = agency_and_role
    rows = await service.list_meetings(
        db,
        agency.id,
        client_id=client_id,
        project_id=project_id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
    )
    return [_meeting_read(meeting, client_name, project_name) for meeting, client_name, project_name in rows]


@router.post("/meetings", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: MeetingCreate
) -> MeetingRead:
    agency, _role = agency_and_role
    client = await get_client_or_404(db, agency.id, data.client_id)
    meeting = await service.book_slot(
        db,
        agency,
        client,
        starts_at=data.starts_at,
        project_id=data.project_id,
        title=data.title,
        notes=data.notes,
        location=data.location,
        booked_by=current_user,
        booked_by_kind=CREATED_BY_AGENCY_MEMBER,
        bypass_notice_window=True,
    )
    return _meeting_read(*(await service.get_meeting_with_names_or_404(db, agency.id, meeting.id)))


@router.get("/meetings/{meeting_id}", response_model=MeetingRead)
async def read_meeting(db: DbSession, agency_and_role: AnyMember, meeting_id: uuid.UUID) -> MeetingRead:
    agency, _role = agency_and_role
    return _meeting_read(*(await service.get_meeting_with_names_or_404(db, agency.id, meeting_id)))


@router.patch("/meetings/{meeting_id}", response_model=MeetingRead)
async def update_meeting(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, meeting_id: uuid.UUID, data: MeetingUpdate
) -> MeetingRead:
    agency, _role = agency_and_role
    meeting = await service.get_meeting_or_404(db, agency.id, meeting_id)
    client = await get_client_or_404(db, agency.id, meeting.client_id)
    await service.update_meeting(
        db,
        meeting,
        agency,
        client,
        project_id=data.project_id,
        starts_at=data.starts_at,
        title=data.title,
        notes=data.notes,
        location=data.location,
        updated_by=current_user,
    )
    return _meeting_read(*(await service.get_meeting_with_names_or_404(db, agency.id, meeting_id)))


@router.post("/meetings/{meeting_id}/cancel", response_model=MeetingRead)
async def cancel_meeting(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, meeting_id: uuid.UUID
) -> MeetingRead:
    agency, _role = agency_and_role
    meeting = await service.get_meeting_or_404(db, agency.id, meeting_id)
    client = await get_client_or_404(db, agency.id, meeting.client_id)
    await service.cancel_meeting(
        db, meeting, agency, client, cancelled_by=current_user, cancelled_by_kind=CREATED_BY_AGENCY_MEMBER
    )
    return _meeting_read(*(await service.get_meeting_with_names_or_404(db, agency.id, meeting_id)))
