import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.time_tracking import service
from binx_api.modules.time_tracking.models import TimeEntry
from binx_api.modules.time_tracking.schemas import (
    ManualEntryCreate,
    TimeEntryRead,
    TimeEntryUpdate,
    TimerStart,
    UninvoicedSummaryRead,
)

router = APIRouter(prefix="/agencies/{agency_id}/time-entries", tags=["time-tracking"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def _amount_cents(entry: TimeEntry) -> int | None:
    if entry.hourly_rate_cents is None:
        return None
    return int(
        (Decimal(entry.duration_minutes) / Decimal(60) * Decimal(entry.hourly_rate_cents)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def _read(entry: TimeEntry, project_name: str, task_title: str | None, user_name: str) -> TimeEntryRead:
    return TimeEntryRead(
        id=entry.id,
        project_id=entry.project_id,
        project_name=project_name,
        task_id=entry.task_id,
        task_title=task_title,
        user_id=entry.user_id,
        user_name=user_name,
        description=entry.description,
        started_at=entry.started_at,
        ended_at=entry.ended_at,
        duration_minutes=entry.duration_minutes,
        is_billable=entry.is_billable,
        hourly_rate_cents=entry.hourly_rate_cents,
        amount_cents=_amount_cents(entry),
        invoiced=entry.invoice_line_item_id is not None,
        created_at=entry.created_at,
    )


async def _single_read(db: DbSession, entry: TimeEntry) -> TimeEntryRead:
    from binx_api.modules.projects.models import Project, ProjectTask
    from binx_api.modules.users.models import User

    project = await db.get(Project, entry.project_id)
    assert project is not None
    task = await db.get(ProjectTask, entry.task_id) if entry.task_id else None
    user = await db.get(User, entry.user_id)
    assert user is not None
    return _read(entry, project.name, task.title if task else None, user.full_name)


@router.get("/running", response_model=TimeEntryRead | None)
async def read_running_timer(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember
) -> TimeEntryRead | None:
    agency, _role = agency_and_role
    entry = await service.get_running_entry(db, agency.id, current_user.id)
    return await _single_read(db, entry) if entry else None


@router.post("/start", response_model=TimeEntryRead, status_code=status.HTTP_201_CREATED)
async def start_timer(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: TimerStart
) -> TimeEntryRead:
    agency, _role = agency_and_role
    entry = await service.start_timer(
        db,
        agency,
        user=current_user,
        project_id=data.project_id,
        task_id=data.task_id,
        description=data.description,
        is_billable=data.is_billable,
    )
    return await _single_read(db, entry)


@router.post("/{entry_id}/stop", response_model=TimeEntryRead)
async def stop_timer(db: DbSession, agency_and_role: AnyMember, entry_id: uuid.UUID) -> TimeEntryRead:
    agency, _role = agency_and_role
    entry = await service.get_entry_or_404(db, agency.id, entry_id)
    entry = await service.stop_timer(db, entry)
    return await _single_read(db, entry)


@router.get("", response_model=list[TimeEntryRead])
async def list_entries(
    db: DbSession,
    agency_and_role: AnyMember,
    project_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    billable: bool | None = Query(default=None),
    uninvoiced: bool = Query(default=False),
) -> list[TimeEntryRead]:
    agency, _role = agency_and_role
    rows = await service.list_entries(
        db,
        agency.id,
        project_id=project_id,
        task_id=task_id,
        user_id=user_id,
        billable_only=billable,
        uninvoiced_only=uninvoiced,
    )
    return [_read(entry, project_name, task_title, user_name) for entry, project_name, task_title, user_name in rows]


@router.get("/uninvoiced-summary", response_model=UninvoicedSummaryRead)
async def read_uninvoiced_summary(
    db: DbSession, agency_and_role: AnyMember, project_id: uuid.UUID
) -> UninvoicedSummaryRead:
    agency, _role = agency_and_role
    return UninvoicedSummaryRead.model_validate(await service.uninvoiced_summary(db, agency.id, project_id=project_id))


@router.post("", response_model=TimeEntryRead, status_code=status.HTTP_201_CREATED)
async def log_manual_entry(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: ManualEntryCreate
) -> TimeEntryRead:
    agency, _role = agency_and_role
    entry = await service.log_manual_entry(
        db,
        agency,
        user=current_user,
        project_id=data.project_id,
        task_id=data.task_id,
        description=data.description,
        started_at=data.started_at,
        ended_at=data.ended_at,
        is_billable=data.is_billable,
        hourly_rate_cents=data.hourly_rate_cents,
    )
    return await _single_read(db, entry)


@router.patch("/{entry_id}", response_model=TimeEntryRead)
async def update_entry(
    db: DbSession, agency_and_role: AnyMember, entry_id: uuid.UUID, data: TimeEntryUpdate
) -> TimeEntryRead:
    agency, _role = agency_and_role
    entry = await service.get_entry_or_404(db, agency.id, entry_id)
    entry = await service.update_entry(
        db,
        entry,
        description=data.description,
        task_id=data.task_id,
        is_billable=data.is_billable,
        hourly_rate_cents=data.hourly_rate_cents,
        started_at=data.started_at,
        ended_at=data.ended_at,
    )
    return await _single_read(db, entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(db: DbSession, agency_and_role: AnyMember, entry_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    entry = await service.get_entry_or_404(db, agency.id, entry_id)
    await service.delete_entry(db, entry)
