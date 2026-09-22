"""End-to-end: a staff member tracks time on a project and bills it onto a
new invoice through the HTTP API."""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_project, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner)
    agency_client = await make_client(db_session, agency=agency, name="Globex")
    project = await make_project(db_session, agency=agency, created_by=owner, client=agency_client)
    return agency, agency_client, project, owner


class TestTimerFlow:
    async def test_start_stop_and_list(self, client, ctx) -> None:
        agency, _agency_client, project, owner = ctx

        start = await client.post(
            f"/agencies/{agency.id}/time-entries/start",
            json={"project_id": str(project.id), "description": "Kickoff prep"},
            headers=auth_headers(owner),
        )
        assert start.status_code == 201, start.text
        entry = start.json()
        assert entry["ended_at"] is None

        running = await client.get(f"/agencies/{agency.id}/time-entries/running", headers=auth_headers(owner))
        assert running.status_code == 200
        assert running.json()["id"] == entry["id"]

        stop = await client.post(f"/agencies/{agency.id}/time-entries/{entry['id']}/stop", headers=auth_headers(owner))
        assert stop.status_code == 200, stop.text
        assert stop.json()["ended_at"] is not None

        none_running = await client.get(f"/agencies/{agency.id}/time-entries/running", headers=auth_headers(owner))
        assert none_running.json() is None

    async def test_second_timer_conflicts(self, client, ctx) -> None:
        agency, _agency_client, project, owner = ctx
        first = await client.post(
            f"/agencies/{agency.id}/time-entries/start",
            json={"project_id": str(project.id)},
            headers=auth_headers(owner),
        )
        assert first.status_code == 201
        second = await client.post(
            f"/agencies/{agency.id}/time-entries/start",
            json={"project_id": str(project.id)},
            headers=auth_headers(owner),
        )
        assert second.status_code == 409


class TestManualEntryAndInvoicing:
    async def test_manual_entry_and_generate_invoice(self, client, ctx) -> None:
        agency, agency_client, project, owner = ctx

        manual = await client.post(
            f"/agencies/{agency.id}/time-entries",
            json={
                "project_id": str(project.id),
                "description": "Design pass",
                "started_at": "2026-01-01T09:00:00Z",
                "ended_at": "2026-01-01T11:00:00Z",
                "hourly_rate_cents": 12000,
            },
            headers=auth_headers(owner),
        )
        assert manual.status_code == 201, manual.text
        entry = manual.json()
        assert entry["duration_minutes"] == 120
        assert entry["amount_cents"] == 24000
        assert entry["invoiced"] is False

        summary = await client.get(
            f"/agencies/{agency.id}/time-entries/uninvoiced-summary",
            params={"project_id": str(project.id)},
            headers=auth_headers(owner),
        )
        assert summary.status_code == 200
        assert summary.json()["billable_amount_cents"] == 24000

        invoice_resp = await client.post(
            f"/agencies/{agency.id}/invoices/from-time-entries",
            json={"client_id": str(agency_client.id), "project_id": str(project.id), "entry_ids": [entry["id"]]},
            headers=auth_headers(owner),
        )
        assert invoice_resp.status_code == 201, invoice_resp.text
        invoice = invoice_resp.json()
        assert invoice["total_cents"] == 24000
        assert len(invoice["line_items"]) == 1

        # The entry is now locked.
        patched = await client.patch(
            f"/agencies/{agency.id}/time-entries/{entry['id']}",
            json={"is_billable": False},
            headers=auth_headers(owner),
        )
        assert patched.status_code == 409

    async def test_generate_invoice_without_rate_fails_clearly(self, client, ctx) -> None:
        agency, agency_client, project, owner = ctx
        manual = await client.post(
            f"/agencies/{agency.id}/time-entries",
            json={
                "project_id": str(project.id),
                "started_at": "2026-01-01T09:00:00Z",
                "ended_at": "2026-01-01T10:00:00Z",
            },
            headers=auth_headers(owner),
        )
        entry = manual.json()
        assert entry["hourly_rate_cents"] is None

        invoice_resp = await client.post(
            f"/agencies/{agency.id}/invoices/from-time-entries",
            json={"client_id": str(agency_client.id), "project_id": str(project.id), "entry_ids": [entry["id"]]},
            headers=auth_headers(owner),
        )
        assert invoice_resp.status_code == 409
