"""End-to-end: the services catalog over HTTP — who may change it, and
service_id travelling onto proposal, invoice and recurring line items."""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Max Member")
    agency = await make_agency(db_session, owner=owner)
    await add_agency_member(db_session, agency=agency, user=member, role="member")
    client_row = await make_client(db_session, agency=agency)
    return agency, owner, member, client_row


async def _create_service(client, agency_id, user, **overrides) -> dict:
    payload = {"name": "Design retainer", "pricing_type": "monthly", "unit_price_cents": 200_000} | overrides
    resp = await client.post(f"/agencies/{agency_id}/services", json=payload, headers=auth_headers(user))
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestServicesApi:
    async def test_owner_manages_member_reads(self, client, ctx) -> None:
        agency, owner, member, _client_row = ctx
        base = f"/agencies/{agency.id}/services"
        created = await _create_service(client, agency.id, owner, description="Ongoing design support")
        assert created["pricing_type"] == "monthly"
        assert created["default_quantity"] == "1.00"

        listed = await client.get(base, headers=auth_headers(member))
        assert listed.status_code == 200
        assert [s["id"] for s in listed.json()] == [created["id"]]

        denied = await client.post(base, json={"name": "X", "unit_price_cents": 1}, headers=auth_headers(member))
        assert denied.status_code == 403
        denied_patch = await client.patch(
            f"{base}/{created['id']}", json={"unit_price_cents": 1}, headers=auth_headers(member)
        )
        assert denied_patch.status_code == 403

        archived = await client.patch(f"{base}/{created['id']}", json={"is_archived": True}, headers=auth_headers(owner))
        assert archived.json()["is_archived"] is True
        assert (await client.get(base, headers=auth_headers(owner))).json() == []
        with_archived = await client.get(base, params={"include_archived": "true"}, headers=auth_headers(owner))
        assert len(with_archived.json()) == 1

        deleted = await client.delete(f"{base}/{created['id']}", headers=auth_headers(owner))
        assert deleted.status_code == 204

    async def test_bad_pricing_type_is_422(self, client, ctx) -> None:
        agency, owner, _member, _client_row = ctx
        resp = await client.post(
            f"/agencies/{agency.id}/services",
            json={"name": "X", "pricing_type": "weekly", "unit_price_cents": 1},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 422

    async def test_other_agency_cannot_touch_a_service(self, client, ctx, db_session) -> None:
        agency, owner, _member, _client_row = ctx
        created = await _create_service(client, agency.id, owner)
        outsider = await make_user(db_session, full_name="Outsider")
        other = await make_agency(db_session, owner=outsider, name="Other")
        resp = await client.patch(
            f"/agencies/{other.id}/services/{created['id']}", json={"name": "Mine"}, headers=auth_headers(outsider)
        )
        assert resp.status_code == 404


class TestServiceOnLineItems:
    async def test_proposal_line_keeps_service_id_and_details(self, client, ctx) -> None:
        agency, owner, member, _client_row = ctx
        svc = await _create_service(client, agency.id, owner)
        resp = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={
                "title": "Retainer proposal",
                "line_items": [
                    {
                        "description": svc["name"],
                        "details": "Up to 20 hours a month",
                        "quantity": "3",
                        "unit_price_cents": svc["unit_price_cents"],
                        "service_id": svc["id"],
                    }
                ],
            },
            headers=auth_headers(member),
        )
        assert resp.status_code == 201, resp.text
        line = resp.json()["line_items"][0]
        assert line["service_id"] == svc["id"]
        assert line["details"] == "Up to 20 hours a month"
        assert resp.json()["total_cents"] == 600_000

    async def test_foreign_service_id_is_rejected_everywhere(self, client, ctx, db_session) -> None:
        agency, owner, _member, client_row = ctx
        outsider = await make_user(db_session, full_name="Outsider")
        other = await make_agency(db_session, owner=outsider, name="Other")
        foreign = await _create_service(client, other.id, outsider)
        line = {"description": "Sneaky", "quantity": "1", "unit_price_cents": 1, "service_id": foreign["id"]}

        proposal = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "P", "line_items": [line]},
            headers=auth_headers(owner),
        )
        assert proposal.status_code == 422

        invoice = await client.post(
            f"/agencies/{agency.id}/invoices",
            json={"client_id": str(client_row.id), "line_items": [line]},
            headers=auth_headers(owner),
        )
        assert invoice.status_code == 422

    async def test_invoice_and_recurring_lines_carry_service_id(self, client, ctx) -> None:
        agency, owner, _member, client_row = ctx
        svc = await _create_service(client, agency.id, owner)
        line = {"description": svc["name"], "quantity": "1", "unit_price_cents": 200_000, "service_id": svc["id"]}

        invoice = await client.post(
            f"/agencies/{agency.id}/invoices",
            json={"client_id": str(client_row.id), "line_items": [line]},
            headers=auth_headers(owner),
        )
        assert invoice.status_code == 201, invoice.text
        assert invoice.json()["line_items"][0]["service_id"] == svc["id"]

        schedule = await client.post(
            f"/agencies/{agency.id}/recurring-invoices",
            json={
                "client_id": str(client_row.id),
                "title": "Monthly retainer",
                "interval": "monthly",
                "day_of_month": 1,
                "line_items": [line],
            },
            headers=auth_headers(owner),
        )
        assert schedule.status_code == 201, schedule.text
        assert schedule.json()["line_items"][0]["service_id"] == svc["id"]

        generated = await client.post(
            f"/agencies/{agency.id}/recurring-invoices/{schedule.json()['id']}/run-now",
            headers=auth_headers(owner),
        )
        assert generated.status_code == 200, generated.text
        invoice_id = generated.json()["id"]
        detail = await client.get(f"/agencies/{agency.id}/invoices/{invoice_id}", headers=auth_headers(owner))
        assert detail.json()["line_items"][0]["service_id"] == svc["id"]
