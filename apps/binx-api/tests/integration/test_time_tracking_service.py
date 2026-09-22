"""Integration tests for binx_api.modules.time_tracking.service — the
single-running-timer guard, hourly-rate resolution (per-entry override vs.
project default), the invoiced-entry lock, and generating an invoice from a
set of entries."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from binx_api.modules.invoicing.service import get_invoice_context
from binx_api.modules.time_tracking import service
from tests.factories import make_agency, make_client, make_project, make_task, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    project = await make_project(db_session, agency=agency, created_by=owner, client=client)
    return owner, agency, client, project


class TestTimer:
    async def test_start_stop_computes_duration(self, db_session, ctx) -> None:
        owner, agency, _client, project = ctx
        entry = await service.start_timer(
            db_session, agency, user=owner, project_id=project.id, task_id=None, description="Working", is_billable=True
        )
        assert entry.ended_at is None

        # Backdate started_at so stop_timer sees a real elapsed duration.
        entry.started_at = datetime.now(UTC) - timedelta(minutes=45)
        await db_session.commit()

        stopped = await service.stop_timer(db_session, entry)
        assert stopped.ended_at is not None
        assert 44 <= stopped.duration_minutes <= 46

    async def test_second_timer_rejected_while_one_running(self, db_session, ctx) -> None:
        owner, agency, _client, project = ctx
        await service.start_timer(
            db_session, agency, user=owner, project_id=project.id, task_id=None, description=None, is_billable=True
        )

        with pytest.raises(HTTPException) as exc:
            await service.start_timer(
                db_session, agency, user=owner, project_id=project.id, task_id=None, description=None, is_billable=True
            )
        assert exc.value.status_code == 409

    async def test_rate_snapshotted_from_project_default_at_stop(self, db_session, ctx) -> None:
        owner, agency, _client, project = ctx
        project.default_hourly_rate_cents = 15_000
        await db_session.commit()

        entry = await service.start_timer(
            db_session, agency, user=owner, project_id=project.id, task_id=None, description=None, is_billable=True
        )
        stopped = await service.stop_timer(db_session, entry)
        assert stopped.hourly_rate_cents == 15_000

        # Changing the project's rate afterward doesn't reprice the entry.
        project.default_hourly_rate_cents = 20_000
        await db_session.commit()
        await db_session.refresh(stopped)
        assert stopped.hourly_rate_cents == 15_000


class TestManualEntry:
    async def test_manual_entry_duration_and_task_link(self, db_session, ctx) -> None:
        owner, agency, _client, project = ctx
        task = await make_task(db_session, project=project)
        start = datetime.now(UTC) - timedelta(hours=2)
        entry = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=task.id,
            description="Client call",
            started_at=start,
            ended_at=start + timedelta(hours=2),
            is_billable=True,
            hourly_rate_cents=10_000,
        )
        assert entry.duration_minutes == 120
        assert entry.task_id == task.id
        assert entry.hourly_rate_cents == 10_000

    async def test_invoiced_entry_cannot_be_edited_or_deleted(self, db_session, ctx) -> None:
        owner, agency, client, project = ctx
        start = datetime.now(UTC) - timedelta(hours=1)
        entry = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description=None,
            started_at=start,
            ended_at=start + timedelta(hours=1),
            is_billable=True,
            hourly_rate_cents=10_000,
        )
        await service.create_invoice_from_entries(
            db_session, agency, created_by=owner, client_id=client.id, project_id=project.id, entry_ids=[entry.id]
        )
        await db_session.refresh(entry)
        assert entry.invoice_line_item_id is not None

        with pytest.raises(HTTPException) as exc:
            await service.delete_entry(db_session, entry)
        assert exc.value.status_code == 409


class TestInvoiceGeneration:
    async def test_creates_one_line_item_per_entry(self, db_session, ctx) -> None:
        owner, agency, client, project = ctx
        start = datetime.now(UTC) - timedelta(hours=3)
        entry_a = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description="Design",
            started_at=start,
            ended_at=start + timedelta(hours=1),
            is_billable=True,
            hourly_rate_cents=10_000,
        )
        entry_b = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description="Dev",
            started_at=start + timedelta(hours=1),
            ended_at=start + timedelta(hours=3),
            is_billable=True,
            hourly_rate_cents=10_000,
        )

        invoice = await service.create_invoice_from_entries(
            db_session,
            agency,
            created_by=owner,
            client_id=client.id,
            project_id=project.id,
            entry_ids=[entry_a.id, entry_b.id],
        )
        *_rest, line_items, _payments = await get_invoice_context(db_session, invoice)
        assert len(line_items) == 2
        # 1hr @ $100 + 2hr @ $100 = $300
        assert invoice.total_cents == 30_000

    async def test_rejects_entry_with_no_resolvable_rate(self, db_session, ctx) -> None:
        owner, agency, client, project = ctx
        start = datetime.now(UTC) - timedelta(hours=1)
        entry = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description=None,
            started_at=start,
            ended_at=start + timedelta(hours=1),
            is_billable=True,
            hourly_rate_cents=None,
        )
        with pytest.raises(HTTPException) as exc:
            await service.create_invoice_from_entries(
                db_session, agency, created_by=owner, client_id=client.id, project_id=project.id, entry_ids=[entry.id]
            )
        assert exc.value.status_code == 409

    async def test_rejects_already_invoiced_entry(self, db_session, ctx) -> None:
        owner, agency, client, project = ctx
        start = datetime.now(UTC) - timedelta(hours=1)
        entry = await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description=None,
            started_at=start,
            ended_at=start + timedelta(hours=1),
            is_billable=True,
            hourly_rate_cents=10_000,
        )
        await service.create_invoice_from_entries(
            db_session, agency, created_by=owner, client_id=client.id, project_id=project.id, entry_ids=[entry.id]
        )
        with pytest.raises(HTTPException) as exc:
            await service.create_invoice_from_entries(
                db_session, agency, created_by=owner, client_id=client.id, project_id=project.id, entry_ids=[entry.id]
            )
        assert exc.value.status_code == 409


class TestUninvoicedSummary:
    async def test_summary_totals(self, db_session, ctx) -> None:
        owner, agency, _client, project = ctx
        start = datetime.now(UTC) - timedelta(hours=1)
        await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description=None,
            started_at=start,
            ended_at=start + timedelta(hours=1),
            is_billable=True,
            hourly_rate_cents=10_000,
        )
        await service.log_manual_entry(
            db_session,
            agency,
            user=owner,
            project_id=project.id,
            task_id=None,
            description=None,
            started_at=start,
            ended_at=start + timedelta(minutes=30),
            is_billable=False,
            hourly_rate_cents=10_000,
        )
        summary = await service.uninvoiced_summary(db_session, agency.id, project_id=project.id)
        assert summary["entry_count"] == 1  # non-billable entry excluded
        assert summary["billable_amount_cents"] == 10_000
