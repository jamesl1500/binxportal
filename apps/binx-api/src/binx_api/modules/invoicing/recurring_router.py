import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.invoicing import recurring_service as service
from binx_api.modules.invoicing.models import RecurringInvoiceSchedule
from binx_api.modules.invoicing.recurring_schemas import (
    RecurringLineItemRead,
    RecurringScheduleCreate,
    RecurringScheduleRead,
    RecurringScheduleUpdate,
)
from binx_api.modules.invoicing.router import _invoice_read
from binx_api.modules.invoicing.schemas import InvoiceRead

router = APIRouter(prefix="/agencies/{agency_id}/recurring-invoices", tags=["invoicing"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


async def _read(
    db: DbSession, schedule: RecurringInvoiceSchedule, client_name: str, project_name: str | None
) -> RecurringScheduleRead:
    line_items = await service.list_line_items(db, schedule.id)
    return RecurringScheduleRead(
        id=schedule.id,
        agency_id=schedule.agency_id,
        client_id=schedule.client_id,
        client_name=client_name,
        project_id=schedule.project_id,
        project_name=project_name,
        title=schedule.title,
        interval=schedule.interval,
        interval_count=schedule.interval_count,
        day_of_month=schedule.day_of_month,
        weekday=schedule.weekday,
        due_days=schedule.due_days,
        tax_rate_percent=schedule.tax_rate_percent,
        auto_issue=schedule.auto_issue,
        is_active=schedule.is_active,
        next_run_date=schedule.next_run_date,
        last_run_at=schedule.last_run_at,
        last_generated_invoice_id=schedule.last_generated_invoice_id,
        line_items=[
            RecurringLineItemRead(
                id=item.id,
                position=item.position,
                description=item.description,
                quantity=item.quantity,
                unit_price_cents=item.unit_price_cents,
            )
            for item in line_items
        ],
        estimated_amount_cents=service.estimated_amount_cents(line_items),
    )


async def _names(db: DbSession, schedule: RecurringInvoiceSchedule) -> tuple[str, str | None]:
    from binx_api.modules.agencies.models import AgencyClient
    from binx_api.modules.projects.models import Project

    client = await db.get(AgencyClient, schedule.client_id)
    assert client is not None
    project = await db.get(Project, schedule.project_id) if schedule.project_id else None
    return client.name, (project.name if project else None)


@router.get("", response_model=list[RecurringScheduleRead])
async def list_schedules(
    db: DbSession, agency_and_role: AnyMember, client_id: uuid.UUID | None = None
) -> list[RecurringScheduleRead]:
    agency, _role = agency_and_role
    # Catch-up-on-read: see recurring_service module docstring. Never lets a
    # bad schedule block the list from loading.
    await service.catch_up_due_schedules(db, agency.id)
    rows = await service.list_schedules(db, agency.id, client_id=client_id)
    return [await _read(db, schedule, client_name, project_name) for schedule, client_name, project_name in rows]


@router.post("", response_model=RecurringScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: RecurringScheduleCreate
) -> RecurringScheduleRead:
    agency, _role = agency_and_role
    schedule = await service.create_schedule(
        db,
        agency,
        created_by=current_user,
        client_id=data.client_id,
        project_id=data.project_id,
        title=data.title,
        interval=data.interval,
        interval_count=data.interval_count,
        day_of_month=data.day_of_month,
        weekday=data.weekday,
        due_days=data.due_days,
        tax_rate_percent=data.tax_rate_percent,
        notes=data.notes,
        payment_instructions=data.payment_instructions,
        auto_issue=data.auto_issue,
        start_date=data.start_date,
        line_items=data.line_items,
    )
    client_name, project_name = await _names(db, schedule)
    return await _read(db, schedule, client_name, project_name)


@router.patch("/{schedule_id}", response_model=RecurringScheduleRead)
async def update_schedule(
    db: DbSession, agency_and_role: AgencyAndRole, schedule_id: uuid.UUID, data: RecurringScheduleUpdate
) -> RecurringScheduleRead:
    agency, _role = agency_and_role
    schedule = await service.get_schedule_or_404(db, agency.id, schedule_id)
    schedule = await service.update_schedule(
        db,
        schedule,
        client_id=data.client_id,
        project_id=data.project_id,
        title=data.title,
        interval=data.interval,
        interval_count=data.interval_count,
        day_of_month=data.day_of_month,
        weekday=data.weekday,
        due_days=data.due_days,
        tax_rate_percent=data.tax_rate_percent,
        notes=data.notes,
        payment_instructions=data.payment_instructions,
        auto_issue=data.auto_issue,
        start_date=data.start_date,
        line_items=data.line_items,
    )
    client_name, project_name = await _names(db, schedule)
    return await _read(db, schedule, client_name, project_name)


@router.post("/{schedule_id}/pause", response_model=RecurringScheduleRead)
async def pause_schedule(
    db: DbSession, agency_and_role: AgencyAndRole, schedule_id: uuid.UUID
) -> RecurringScheduleRead:
    agency, _role = agency_and_role
    schedule = await service.get_schedule_or_404(db, agency.id, schedule_id)
    schedule = await service.set_active(db, schedule, is_active=False)
    client_name, project_name = await _names(db, schedule)
    return await _read(db, schedule, client_name, project_name)


@router.post("/{schedule_id}/resume", response_model=RecurringScheduleRead)
async def resume_schedule(
    db: DbSession, agency_and_role: AgencyAndRole, schedule_id: uuid.UUID
) -> RecurringScheduleRead:
    agency, _role = agency_and_role
    schedule = await service.get_schedule_or_404(db, agency.id, schedule_id)
    schedule = await service.set_active(db, schedule, is_active=True)
    client_name, project_name = await _names(db, schedule)
    return await _read(db, schedule, client_name, project_name)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(db: DbSession, agency_and_role: AgencyAndRole, schedule_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    schedule = await service.get_schedule_or_404(db, agency.id, schedule_id)
    await service.delete_schedule(db, schedule)


@router.post("/{schedule_id}/run-now", response_model=InvoiceRead)
async def run_schedule_now(db: DbSession, agency_and_role: AgencyAndRole, schedule_id: uuid.UUID) -> InvoiceRead:
    agency, _role = agency_and_role
    schedule = await service.get_schedule_or_404(db, agency.id, schedule_id)
    invoice = await service.run_schedule_now(db, schedule)
    from binx_api.modules.invoicing import service as invoicing_service

    _agency, client, project_name, *_rest = await invoicing_service.get_invoice_context(db, invoice)
    return _invoice_read(invoice, client.name, project_name)
