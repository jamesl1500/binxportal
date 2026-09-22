"""End-to-end: staff set up a monthly retainer schedule, listing it (which
triggers catch-up generation for anything already due) produces a real
invoice, and "Generate now" works on demand."""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner)
    agency_client = await make_client(db_session, agency=agency, name="Globex")
    return agency, agency_client, owner


class TestRecurringSchedule:
    async def test_create_and_list_catches_up_due_invoice(self, client, ctx) -> None:
        agency, agency_client, owner = ctx

        create = await client.post(
            f"/agencies/{agency.id}/recurring-invoices",
            json={
                "client_id": str(agency_client.id),
                "title": "Monthly retainer",
                "interval": "monthly",
                "day_of_month": 1,
                "due_days": 14,
                "start_date": "2026-01-01",
                "line_items": [{"description": "Retainer", "quantity": "1", "unit_price_cents": 500000}],
            },
            headers=auth_headers(owner),
        )
        assert create.status_code == 201, create.text
        schedule = create.json()
        assert schedule["next_run_date"] == "2026-01-01"
        assert schedule["estimated_amount_cents"] == 500000

        listed = await client.get(f"/agencies/{agency.id}/recurring-invoices", headers=auth_headers(owner))
        assert listed.status_code == 200
        found = next(s for s in listed.json() if s["id"] == schedule["id"])
        # Listing runs catch-up as of "today" — since 2026-01-01 is in the
        # past relative to any real test run, the schedule must have advanced.
        assert found["next_run_date"] != "2026-01-01"
        assert found["last_generated_invoice_id"] is not None

        invoices = await client.get(f"/agencies/{agency.id}/invoices", headers=auth_headers(owner))
        assert any(inv["id"] == found["last_generated_invoice_id"] for inv in invoices.json())

    async def test_run_now_and_pause_resume(self, client, ctx) -> None:
        agency, agency_client, owner = ctx
        create = await client.post(
            f"/agencies/{agency.id}/recurring-invoices",
            json={
                "client_id": str(agency_client.id),
                "title": "Monthly retainer",
                "interval": "monthly",
                "day_of_month": 1,
                "start_date": "2027-01-01",  # far future — won't be picked up by catch-up
                "line_items": [{"description": "Retainer", "quantity": "1", "unit_price_cents": 300000}],
            },
            headers=auth_headers(owner),
        )
        schedule_id = create.json()["id"]

        run_now = await client.post(
            f"/agencies/{agency.id}/recurring-invoices/{schedule_id}/run-now", headers=auth_headers(owner)
        )
        assert run_now.status_code == 200, run_now.text
        assert run_now.json()["total_cents"] == 300000

        paused = await client.post(
            f"/agencies/{agency.id}/recurring-invoices/{schedule_id}/pause", headers=auth_headers(owner)
        )
        assert paused.status_code == 200
        assert paused.json()["is_active"] is False

        run_while_paused = await client.post(
            f"/agencies/{agency.id}/recurring-invoices/{schedule_id}/run-now", headers=auth_headers(owner)
        )
        assert run_while_paused.status_code == 409

        resumed = await client.post(
            f"/agencies/{agency.id}/recurring-invoices/{schedule_id}/resume", headers=auth_headers(owner)
        )
        assert resumed.status_code == 200
        assert resumed.json()["is_active"] is True

    async def test_delete_schedule(self, client, ctx) -> None:
        agency, agency_client, owner = ctx
        create = await client.post(
            f"/agencies/{agency.id}/recurring-invoices",
            json={
                "client_id": str(agency_client.id),
                "title": "One-off retainer",
                "interval": "weekly",
                "weekday": 0,
                "start_date": "2027-01-01",
                "line_items": [{"description": "Retainer", "quantity": "1", "unit_price_cents": 100000}],
            },
            headers=auth_headers(owner),
        )
        schedule_id = create.json()["id"]
        deleted = await client.delete(
            f"/agencies/{agency.id}/recurring-invoices/{schedule_id}", headers=auth_headers(owner)
        )
        assert deleted.status_code == 204
