"""Service layer for recurring invoice schedules (retainers).

There's no background job runner in this deployment, so "runs on a
schedule" is implemented as catch-up-on-read: ``catch_up_due_schedules`` is
called every time the Recurring Invoices list is loaded (see
recurring_router.py::list_schedules) and generates anything whose
``next_run_date`` has arrived, so an actively-used agency never has to think
about it. ``run_schedule_now`` is the same generation path invoked for one
schedule immediately (a "Generate now" button) regardless of its
next_run_date. Once this app has a real periodic job, pointing it at
``catch_up_all_agencies`` makes generation actually happen even for an
agency nobody has opened today — see the module docstring on
invoicing/models.py's RecurringInvoiceSchedule.
"""

from __future__ import annotations

import logging
import uuid
from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import Invoice, RecurringInvoiceLineItem, RecurringInvoiceSchedule
from binx_api.modules.invoicing.recurring_schemas import RecurringLineItemInput
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import User
from binx_api.modules.users.service import get_user_by_id

logger = logging.getLogger(__name__)


def _clamp_day(year: int, month: int, day: int) -> int:
    return min(day, monthrange(year, month)[1])


def _first_run_date(
    *, interval: str, interval_count: int, day_of_month: int | None, weekday: int | None, start: date
) -> date:
    if interval == "monthly":
        assert day_of_month is not None
        candidate = date(start.year, start.month, _clamp_day(start.year, start.month, day_of_month))
        if candidate < start:
            candidate = _advance_monthly(candidate, interval_count, day_of_month)
        return candidate
    assert weekday is not None
    delta = (weekday - start.weekday()) % 7
    return start + timedelta(days=delta)


def _advance_monthly(current: date, interval_count: int, day_of_month: int) -> date:
    month_index = (current.year * 12 + (current.month - 1)) + interval_count
    year, month = divmod(month_index, 12)
    month += 1
    return date(year, month, _clamp_day(year, month, day_of_month))


def _advance(schedule: RecurringInvoiceSchedule) -> date:
    if schedule.interval == "monthly":
        assert schedule.day_of_month is not None
        return _advance_monthly(schedule.next_run_date, schedule.interval_count, schedule.day_of_month)
    return schedule.next_run_date + timedelta(weeks=schedule.interval_count)


async def _get_project_or_404(db: AsyncSession, agency_id: uuid.UUID, project_id: uuid.UUID | None) -> None:
    if project_id is None:
        return
    result = await db.execute(select(Project.id).where(Project.id == project_id, Project.agency_id == agency_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")


async def get_schedule_or_404(
    db: AsyncSession, agency_id: uuid.UUID, schedule_id: uuid.UUID
) -> RecurringInvoiceSchedule:
    result = await db.execute(
        select(RecurringInvoiceSchedule).where(
            RecurringInvoiceSchedule.id == schedule_id, RecurringInvoiceSchedule.agency_id == agency_id
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurring schedule not found")
    return schedule


async def list_line_items(db: AsyncSession, schedule_id: uuid.UUID) -> list[RecurringInvoiceLineItem]:
    result = await db.execute(
        select(RecurringInvoiceLineItem)
        .where(RecurringInvoiceLineItem.schedule_id == schedule_id)
        .order_by(RecurringInvoiceLineItem.position)
    )
    return list(result.scalars().all())


async def _replace_line_items(
    db: AsyncSession, schedule: RecurringInvoiceSchedule, line_items: list[RecurringLineItemInput]
) -> list[RecurringInvoiceLineItem]:
    await db.execute(
        RecurringInvoiceLineItem.__table__.delete().where(RecurringInvoiceLineItem.schedule_id == schedule.id)
    )
    rows: list[RecurringInvoiceLineItem] = []
    for position, item in enumerate(line_items):
        row = RecurringInvoiceLineItem(
            schedule_id=schedule.id,
            position=position,
            description=item.description,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
        )
        db.add(row)
        rows.append(row)
    return rows


def estimated_amount_cents(line_items: list[RecurringInvoiceLineItem]) -> int:
    return sum(
        int((Decimal(item.quantity) * Decimal(item.unit_price_cents)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        for item in line_items
    )


async def create_schedule(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    client_id: uuid.UUID,
    project_id: uuid.UUID | None,
    title: str,
    interval: str,
    interval_count: int,
    day_of_month: int | None,
    weekday: int | None,
    due_days: int,
    tax_rate_percent: Decimal,
    notes: str | None,
    payment_instructions: str | None,
    auto_issue: bool,
    start_date: date | None,
    line_items: list[RecurringLineItemInput],
) -> RecurringInvoiceSchedule:
    await agencies_service.get_client_or_404(db, agency.id, client_id)
    await _get_project_or_404(db, agency.id, project_id)

    next_run = _first_run_date(
        interval=interval,
        interval_count=interval_count,
        day_of_month=day_of_month,
        weekday=weekday,
        start=start_date or datetime.now(UTC).date(),
    )

    schedule = RecurringInvoiceSchedule(
        agency_id=agency.id,
        client_id=client_id,
        project_id=project_id,
        created_by_id=created_by.id,
        title=title,
        interval=interval,
        interval_count=interval_count,
        day_of_month=day_of_month,
        weekday=weekday,
        due_days=due_days,
        tax_rate_percent=tax_rate_percent,
        notes=notes,
        payment_instructions=payment_instructions,
        auto_issue=auto_issue,
        next_run_date=next_run,
    )
    db.add(schedule)
    await db.flush()
    await _replace_line_items(db, schedule, line_items)
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def update_schedule(
    db: AsyncSession,
    schedule: RecurringInvoiceSchedule,
    *,
    client_id: uuid.UUID,
    project_id: uuid.UUID | None,
    title: str,
    interval: str,
    interval_count: int,
    day_of_month: int | None,
    weekday: int | None,
    due_days: int,
    tax_rate_percent: Decimal,
    notes: str | None,
    payment_instructions: str | None,
    auto_issue: bool,
    start_date: date | None,
    line_items: list[RecurringLineItemInput],
) -> RecurringInvoiceSchedule:
    await agencies_service.get_client_or_404(db, schedule.agency_id, client_id)
    await _get_project_or_404(db, schedule.agency_id, project_id)

    schedule.client_id = client_id
    schedule.project_id = project_id
    schedule.title = title
    schedule.interval = interval
    schedule.interval_count = interval_count
    schedule.day_of_month = day_of_month
    schedule.weekday = weekday
    schedule.due_days = due_days
    schedule.tax_rate_percent = tax_rate_percent
    schedule.notes = notes
    schedule.payment_instructions = payment_instructions
    schedule.auto_issue = auto_issue
    # Only re-anchor next_run_date if the caller explicitly gave a new
    # start_date — otherwise editing a schedule's price shouldn't reset when
    # its next invoice goes out.
    if start_date is not None:
        schedule.next_run_date = _first_run_date(
            interval=interval,
            interval_count=interval_count,
            day_of_month=day_of_month,
            weekday=weekday,
            start=start_date,
        )

    await _replace_line_items(db, schedule, line_items)
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def set_active(
    db: AsyncSession, schedule: RecurringInvoiceSchedule, *, is_active: bool
) -> RecurringInvoiceSchedule:
    schedule.is_active = is_active
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def delete_schedule(db: AsyncSession, schedule: RecurringInvoiceSchedule) -> None:
    await db.delete(schedule)
    await db.commit()


async def list_schedules(
    db: AsyncSession, agency_id: uuid.UUID, *, client_id: uuid.UUID | None = None
) -> list[tuple[RecurringInvoiceSchedule, str, str | None]]:
    query = (
        select(RecurringInvoiceSchedule, AgencyClient.name, Project.name)
        .join(AgencyClient, AgencyClient.id == RecurringInvoiceSchedule.client_id)
        .outerjoin(Project, Project.id == RecurringInvoiceSchedule.project_id)
        .where(RecurringInvoiceSchedule.agency_id == agency_id)
    )
    if client_id is not None:
        query = query.where(RecurringInvoiceSchedule.client_id == client_id)
    query = query.order_by(RecurringInvoiceSchedule.next_run_date)
    rows = (await db.execute(query)).all()
    return [(schedule, client_name, project_name) for schedule, client_name, project_name in rows]


async def _generate_one(db: AsyncSession, schedule: RecurringInvoiceSchedule) -> Invoice:
    rows = await list_line_items(db, schedule.id)
    line_items = [
        LineItemInput(description=r.description, quantity=r.quantity, unit_price_cents=r.unit_price_cents) for r in rows
    ]
    agency = await db.get(Agency, schedule.agency_id)
    assert agency is not None
    created_by = await get_user_by_id(db, schedule.created_by_id) if schedule.created_by_id else None

    issue = schedule.next_run_date
    invoice = await invoicing_service.create_invoice(
        db,
        agency,
        created_by=created_by,
        client_id=schedule.client_id,
        project_id=schedule.project_id,
        issue_date=issue,
        due_date=issue + timedelta(days=schedule.due_days),
        discount_amount_cents=None,
        discount_percent=None,
        tax_rate_percent=schedule.tax_rate_percent,
        notes=schedule.notes,
        payment_instructions=schedule.payment_instructions,
        line_items=line_items,
    )
    if schedule.auto_issue:
        invoice = await invoicing_service.issue_invoice(db, invoice, issued_by=created_by) if created_by else invoice

    schedule.last_generated_invoice_id = invoice.id
    schedule.last_run_at = datetime.now(UTC)
    schedule.next_run_date = _advance(schedule)
    await db.commit()
    return invoice


async def run_schedule_now(db: AsyncSession, schedule: RecurringInvoiceSchedule) -> Invoice:
    if not schedule.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This schedule is paused")
    return await _generate_one(db, schedule)


async def catch_up_due_schedules(db: AsyncSession, agency_id: uuid.UUID, *, as_of: date | None = None) -> list[Invoice]:
    """Generates every active schedule in this agency whose next_run_date has
    arrived. Skips (and logs) a schedule that errors so one bad schedule
    never blocks the rest — the caller is a page load, not a place to
    surface a 500 for someone else's misconfigured retainer."""
    as_of = as_of or datetime.now(UTC).date()
    result = await db.execute(
        select(RecurringInvoiceSchedule).where(
            RecurringInvoiceSchedule.agency_id == agency_id,
            RecurringInvoiceSchedule.is_active.is_(True),
            RecurringInvoiceSchedule.next_run_date <= as_of,
        )
    )
    due = list(result.scalars().all())
    generated: list[Invoice] = []
    for schedule in due:
        try:
            generated.append(await _generate_one(db, schedule))
        except Exception:
            logger.exception("Failed to auto-generate invoice for recurring schedule %s", schedule.id)
            await db.rollback()
    return generated
