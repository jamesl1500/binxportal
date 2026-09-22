"""Integration tests for binx_api.modules.invoicing.recurring_service — the
date-advancement math (monthly with day-of-month clamping, weekly), the
catch-up-on-read generation, and auto_issue."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from binx_api.modules.invoicing import recurring_service as service
from binx_api.modules.invoicing.models import STATUS_DRAFT, STATUS_SENT
from binx_api.modules.invoicing.recurring_schemas import RecurringLineItemInput
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    return owner, agency, client


async def _make_schedule(db_session, agency, owner, client, **overrides):
    defaults = {
        "client_id": client.id,
        "project_id": None,
        "title": "Monthly retainer",
        "interval": "monthly",
        "interval_count": 1,
        "day_of_month": 1,
        "weekday": None,
        "due_days": 14,
        "tax_rate_percent": Decimal("0"),
        "notes": None,
        "payment_instructions": None,
        "auto_issue": False,
        "start_date": None,
        "line_items": [RecurringLineItemInput(description="Retainer", quantity=Decimal("1"), unit_price_cents=500_000)],
    }
    defaults.update(overrides)
    return await service.create_schedule(db_session, agency, created_by=owner, **defaults)


class TestFirstRunDate:
    async def test_monthly_starts_this_month_if_day_not_passed(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=28, start_date=date(2026, 3, 1))
        assert schedule.next_run_date == date(2026, 3, 28)

    async def test_monthly_rolls_to_next_month_if_day_passed(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=5, start_date=date(2026, 3, 10))
        assert schedule.next_run_date == date(2026, 4, 5)

    async def test_monthly_clamps_short_months(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        # day_of_month=28 is the max allowed by the schema, but _advance_monthly
        # itself supports higher values via direct construction — exercise the
        # clamp helper directly for a 30-day-request in February.
        clamped = service._clamp_day(2026, 2, 30)
        assert clamped == 28

    async def test_weekly_picks_next_matching_weekday(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        # 2026-03-02 is a Monday (weekday 0); ask for Friday (4).
        schedule = await _make_schedule(
            db_session,
            agency,
            owner,
            client,
            interval="weekly",
            day_of_month=None,
            weekday=4,
            start_date=date(2026, 3, 2),
        )
        assert schedule.next_run_date == date(2026, 3, 6)
        assert schedule.next_run_date.weekday() == 4


class TestAdvance:
    async def test_advance_monthly_moves_forward_one_interval(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(
            db_session, agency, owner, client, day_of_month=15, start_date=date(2026, 1, 15)
        )
        assert schedule.next_run_date == date(2026, 1, 15)
        next_date = service._advance(schedule)
        assert next_date == date(2026, 2, 15)

    async def test_advance_weekly_moves_forward_by_weeks(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(
            db_session,
            agency,
            owner,
            client,
            interval="weekly",
            day_of_month=None,
            weekday=0,
            interval_count=2,
            start_date=date(2026, 3, 2),
        )
        next_date = service._advance(schedule)
        assert next_date == date(2026, 3, 16)  # +2 weeks


class TestGeneration:
    async def test_catch_up_generates_due_invoice_and_advances(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=1, start_date=date(2026, 1, 1))

        generated = await service.catch_up_due_schedules(db_session, agency.id, as_of=date(2026, 1, 1))
        assert len(generated) == 1
        invoice = generated[0]
        assert invoice.total_cents == 500_000
        assert invoice.status == STATUS_DRAFT  # auto_issue defaulted False

        await db_session.refresh(schedule)
        assert schedule.next_run_date == date(2026, 2, 1)
        assert schedule.last_generated_invoice_id == invoice.id

    async def test_catch_up_skips_not_yet_due(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await _make_schedule(db_session, agency, owner, client, day_of_month=15, start_date=date(2026, 6, 1))
        generated = await service.catch_up_due_schedules(db_session, agency.id, as_of=date(2026, 6, 1))
        assert generated == []

    async def test_auto_issue_issues_immediately(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await _make_schedule(
            db_session, agency, owner, client, day_of_month=1, start_date=date(2026, 1, 1), auto_issue=True
        )
        generated = await service.catch_up_due_schedules(db_session, agency.id, as_of=date(2026, 1, 1))
        assert generated[0].status == STATUS_SENT

    async def test_paused_schedule_not_picked_up(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=1, start_date=date(2026, 1, 1))
        await service.set_active(db_session, schedule, is_active=False)
        generated = await service.catch_up_due_schedules(db_session, agency.id, as_of=date(2026, 1, 1))
        assert generated == []

    async def test_run_schedule_now_ignores_next_run_date(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=1, start_date=date(2026, 6, 1))
        invoice = await service.run_schedule_now(db_session, schedule)
        assert invoice.total_cents == 500_000

    async def test_editing_price_does_not_reset_next_run_date(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        schedule = await _make_schedule(db_session, agency, owner, client, day_of_month=15, start_date=date(2026, 6, 1))
        original_next_run = schedule.next_run_date

        updated = await service.update_schedule(
            db_session,
            schedule,
            client_id=client.id,
            project_id=None,
            title="Monthly retainer",
            interval="monthly",
            interval_count=1,
            day_of_month=15,
            weekday=None,
            due_days=14,
            tax_rate_percent=Decimal("0"),
            notes=None,
            payment_instructions=None,
            auto_issue=False,
            start_date=None,  # no explicit re-anchor
            line_items=[
                RecurringLineItemInput(description="Retainer", quantity=Decimal("1"), unit_price_cents=600_000)
            ],
        )
        assert updated.next_run_date == original_next_run
        line_items = await service.list_line_items(db_session, schedule.id)
        assert line_items[0].unit_price_cents == 600_000
