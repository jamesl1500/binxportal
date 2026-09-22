"""Service layer for time tracking.

A user has at most one running timer at a time, agency-wide (not just per
project) — starting a new one while another runs is rejected rather than
silently stopping the old one, so nobody loses unlogged time by accident.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from math import ceil

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import Invoice
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.projects.models import Project, ProjectTask
from binx_api.modules.time_tracking.models import TimeEntry
from binx_api.modules.users.models import User


async def _get_project_or_404(db: AsyncSession, agency_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.agency_id == agency_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def _validate_task(db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID | None) -> None:
    if task_id is None:
        return
    result = await db.execute(
        select(ProjectTask.id).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found on this project")


def resolve_hourly_rate_cents(entry_override: int | None, project: Project) -> int | None:
    return entry_override if entry_override is not None else project.default_hourly_rate_cents


def _duration_minutes(started_at: datetime, ended_at: datetime) -> int:
    seconds = (ended_at - started_at).total_seconds()
    return max(1, ceil(seconds / 60))


def _require_not_invoiced(entry: TimeEntry) -> None:
    if entry.invoice_line_item_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This entry has already been billed onto an invoice")


async def get_entry_or_404(db: AsyncSession, agency_id: uuid.UUID, entry_id: uuid.UUID) -> TimeEntry:
    result = await db.execute(select(TimeEntry).where(TimeEntry.id == entry_id, TimeEntry.agency_id == agency_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time entry not found")
    return entry


async def get_running_entry(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> TimeEntry | None:
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.agency_id == agency_id, TimeEntry.user_id == user_id, TimeEntry.ended_at.is_(None)
        )
    )
    return result.scalar_one_or_none()


async def start_timer(
    db: AsyncSession,
    agency: Agency,
    *,
    user: User,
    project_id: uuid.UUID,
    task_id: uuid.UUID | None,
    description: str | None,
    is_billable: bool,
) -> TimeEntry:
    if (await get_running_entry(db, agency.id, user.id)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have a timer running — stop it before starting another"
        )
    await _get_project_or_404(db, agency.id, project_id)
    await _validate_task(db, project_id, task_id)

    entry = TimeEntry(
        agency_id=agency.id,
        project_id=project_id,
        task_id=task_id,
        user_id=user.id,
        description=description,
        started_at=datetime.now(UTC),
        is_billable=is_billable,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def stop_timer(db: AsyncSession, entry: TimeEntry) -> TimeEntry:
    if entry.ended_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This timer was already stopped")
    project = await db.get(Project, entry.project_id)
    assert project is not None

    entry.ended_at = datetime.now(UTC)
    entry.duration_minutes = _duration_minutes(entry.started_at, entry.ended_at)
    entry.hourly_rate_cents = resolve_hourly_rate_cents(entry.hourly_rate_cents, project)
    await db.commit()
    await db.refresh(entry)
    return entry


async def log_manual_entry(
    db: AsyncSession,
    agency: Agency,
    *,
    user: User,
    project_id: uuid.UUID,
    task_id: uuid.UUID | None,
    description: str | None,
    started_at: datetime,
    ended_at: datetime,
    is_billable: bool,
    hourly_rate_cents: int | None,
) -> TimeEntry:
    project = await _get_project_or_404(db, agency.id, project_id)
    await _validate_task(db, project_id, task_id)

    entry = TimeEntry(
        agency_id=agency.id,
        project_id=project_id,
        task_id=task_id,
        user_id=user.id,
        description=description,
        started_at=started_at,
        ended_at=ended_at,
        duration_minutes=_duration_minutes(started_at, ended_at),
        is_billable=is_billable,
        hourly_rate_cents=resolve_hourly_rate_cents(hourly_rate_cents, project),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def update_entry(
    db: AsyncSession,
    entry: TimeEntry,
    *,
    description: str | None,
    task_id: uuid.UUID | None,
    is_billable: bool,
    hourly_rate_cents: int | None,
    started_at: datetime | None,
    ended_at: datetime | None,
) -> TimeEntry:
    _require_not_invoiced(entry)
    await _validate_task(db, entry.project_id, task_id)

    entry.description = description
    entry.task_id = task_id
    entry.is_billable = is_billable

    if started_at is not None:
        entry.started_at = started_at
    if ended_at is not None:
        entry.ended_at = ended_at
    if entry.ended_at is not None:
        if entry.ended_at <= entry.started_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "ended_at must be after started_at")
        entry.duration_minutes = _duration_minutes(entry.started_at, entry.ended_at)

    if hourly_rate_cents is not None:
        entry.hourly_rate_cents = hourly_rate_cents
    elif entry.hourly_rate_cents is None:
        project = await db.get(Project, entry.project_id)
        assert project is not None
        entry.hourly_rate_cents = project.default_hourly_rate_cents

    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_entry(db: AsyncSession, entry: TimeEntry) -> None:
    _require_not_invoiced(entry)
    await db.delete(entry)
    await db.commit()


async def list_entries(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None = None,
    task_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    billable_only: bool | None = None,
    uninvoiced_only: bool = False,
) -> list[tuple[TimeEntry, str, str | None, str]]:
    query = (
        select(TimeEntry, Project.name, ProjectTask.title, User.full_name)
        .join(Project, Project.id == TimeEntry.project_id)
        .outerjoin(ProjectTask, ProjectTask.id == TimeEntry.task_id)
        .join(User, User.id == TimeEntry.user_id)
        .where(TimeEntry.agency_id == agency_id)
    )
    if project_id is not None:
        query = query.where(TimeEntry.project_id == project_id)
    if task_id is not None:
        query = query.where(TimeEntry.task_id == task_id)
    if user_id is not None:
        query = query.where(TimeEntry.user_id == user_id)
    if billable_only is not None:
        query = query.where(TimeEntry.is_billable == billable_only)
    if uninvoiced_only:
        query = query.where(TimeEntry.invoice_line_item_id.is_(None))
    query = query.order_by(TimeEntry.started_at.desc())

    rows = (await db.execute(query)).all()
    return [(entry, project_name, task_title, user_name) for entry, project_name, task_title, user_name in rows]


async def uninvoiced_summary(db: AsyncSession, agency_id: uuid.UUID, *, project_id: uuid.UUID) -> dict:
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.agency_id == agency_id,
            TimeEntry.project_id == project_id,
            TimeEntry.is_billable.is_(True),
            TimeEntry.invoice_line_item_id.is_(None),
            TimeEntry.ended_at.isnot(None),
        )
    )
    entries = list(result.scalars().all())
    total_minutes = sum(e.duration_minutes for e in entries)
    rated = [e for e in entries if e.hourly_rate_cents is not None]
    amount = sum(
        int(
            (Decimal(e.duration_minutes) / Decimal(60) * Decimal(e.hourly_rate_cents)).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )
        for e in rated
    )
    return {
        "entry_count": len(entries),
        "total_minutes": total_minutes,
        "billable_amount_cents": amount,
        "unrated_entry_count": len(entries) - len(rated),
    }


def _entry_line_item(entry: TimeEntry, project_name: str) -> LineItemInput:
    hours = (Decimal(entry.duration_minutes) / Decimal(60)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    date_label = entry.started_at.date().isoformat()
    description = (
        f"{entry.description} ({project_name}, {date_label})"
        if entry.description
        else f"{project_name} — time logged {date_label}"
    )
    return LineItemInput(description=description[:1024], quantity=hours, unit_price_cents=entry.hourly_rate_cents)


async def create_invoice_from_entries(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    client_id: uuid.UUID,
    project_id: uuid.UUID,
    entry_ids: list[uuid.UUID],
) -> Invoice:
    """Bills a set of uninvoiced time entries onto a brand-new draft invoice,
    one line item per entry, then locks each entry to that line item so it
    can't be billed twice. All entries must belong to the same project — an
    invoice's line items don't otherwise carry a per-line project, so mixing
    projects on one invoice would silently blur which project got billed."""
    project = await _get_project_or_404(db, agency.id, project_id)
    await agencies_service.get_client_or_404(db, agency.id, client_id)

    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.id.in_(entry_ids),
            TimeEntry.agency_id == agency.id,
            TimeEntry.project_id == project_id,
        )
    )
    entries = list(result.scalars().all())
    if len(entries) != len(set(entry_ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more time entries weren't found on this project")
    for entry in entries:
        if entry.ended_at is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Stop the running timer before invoicing it")
        if entry.invoice_line_item_id is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "One or more entries have already been invoiced")
        if entry.hourly_rate_cents is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "One or more entries have no hourly rate — set the project's default rate or a per-entry rate first",
            )

    # Stable order so the line items created below line up 1:1 with `entries`.
    entries.sort(key=lambda e: e.started_at)
    line_items = [_entry_line_item(entry, project.name) for entry in entries]

    invoice = await invoicing_service.create_invoice(
        db,
        agency,
        created_by=created_by,
        client_id=client_id,
        project_id=project_id,
        issue_date=None,
        due_date=None,
        discount_amount_cents=None,
        discount_percent=None,
        tax_rate_percent=Decimal("0"),
        notes=None,
        payment_instructions=None,
        line_items=line_items,
    )

    rows = await invoicing_service.list_line_items(db, invoice.id)
    for entry, row in zip(entries, rows, strict=True):
        entry.invoice_line_item_id = row.id
    await db.commit()
    return invoice
