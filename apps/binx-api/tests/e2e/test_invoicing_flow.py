"""
End-to-end tests for the ``/agencies/{id}/invoices`` + ``/billing-settings``
routers.

The headline journey: a member drafts an invoice, an admin issues it, payments
are recorded until it's paid, then it's voided — with the permission split and
client-deletion guard checked along the way.
"""

from __future__ import annotations

from datetime import date

import pytest

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, AgencyMember
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def team(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Mia Member")
    admin = await make_user(db_session, full_name="Adam Admin")
    agency = await make_agency(db_session, owner=owner)
    db_session.add(AgencyMember(agency_id=agency.id, user_id=member.id, role=ROLE_MEMBER))
    db_session.add(AgencyMember(agency_id=agency.id, user_id=admin.id, role=ROLE_ADMIN))
    await db_session.commit()
    client = await make_client(db_session, agency=agency, name="Globex")
    return agency, client, owner, member, admin


class TestInvoiceLifecycle:
    async def test_draft_issue_pay_void(self, client, team) -> None:
        agency, agency_client, _owner, member, admin = team
        m, a = auth_headers(member), auth_headers(admin)
        base = f"/agencies/{agency.id}"

        created = await client.post(
            f"{base}/invoices",
            json={
                "client_id": str(agency_client.id),
                "tax_rate_percent": "10",
                "line_items": [
                    {"description": "Build", "quantity": "10", "unit_price_cents": 15000},
                    {"description": "Hosting", "quantity": "1", "unit_price_cents": 200000},
                ],
            },
            headers=m,
        )
        assert created.status_code == 201
        invoice = created.json()
        invoice_id = invoice["id"]
        assert invoice["number"] == "INV-0001"
        assert invoice["subtotal_cents"] == 350000
        assert invoice["tax_cents"] == 35000
        assert invoice["total_cents"] == 385000
        assert invoice["status"] == "draft"
        # Billing settings aren't filled in — the "from" name falls back to the agency name.
        assert invoice["from"]["name"] == "Acme Agency"

        # A member can't issue.
        assert (await client.post(f"{base}/invoices/{invoice_id}/issue", json={}, headers=m)).status_code == 403

        issued = await client.post(f"{base}/invoices/{invoice_id}/issue", json={"send_notice": False}, headers=a)
        assert issued.status_code == 200
        assert issued.json()["status"] == "sent"

        # Editing an issued invoice is refused.
        assert (
            await client.patch(
                f"{base}/invoices/{invoice_id}",
                json={"client_id": str(agency_client.id), "tax_rate_percent": "0", "line_items": []},
                headers=m,
            )
        ).status_code == 409

        # Record a partial then a covering payment.
        partial = await client.post(
            f"{base}/invoices/{invoice_id}/payments",
            json={"amount_cents": 100000, "paid_on": date.today().isoformat(), "method": "bank_transfer"},
            headers=m,
        )
        assert partial.json()["display_status"] == "partial"
        assert partial.json()["amount_due_cents"] == 285000

        covered = await client.post(
            f"{base}/invoices/{invoice_id}/payments",
            json={"amount_cents": 285000, "paid_on": date.today().isoformat(), "method": "check", "reference": "1042"},
            headers=m,
        )
        assert covered.json()["status"] == "paid"

        # A member can't void; an admin can.
        assert (await client.post(f"{base}/invoices/{invoice_id}/void", headers=m)).status_code == 403
        voided = await client.post(f"{base}/invoices/{invoice_id}/void", headers=a)
        assert voided.json()["status"] == "void"
        assert voided.json()["number"] == "INV-0001"  # keeps its number

    async def test_client_with_invoices_cannot_be_deleted(self, client, team) -> None:
        agency, agency_client, owner, _member, _admin = team
        base = f"/agencies/{agency.id}"
        await client.post(
            f"{base}/invoices",
            json={
                "client_id": str(agency_client.id),
                "line_items": [{"description": "x", "quantity": "1", "unit_price_cents": 100}],
            },
            headers=auth_headers(owner),
        )
        refused = await client.delete(f"{base}/clients/{agency_client.id}", headers=auth_headers(owner))
        assert refused.status_code == 409
        assert "invoice" in refused.json()["detail"].lower()

    async def test_non_member_gets_404(self, client, team, db_session) -> None:
        agency, _agency_client, _owner, _member, _admin = team
        outsider = await make_user(db_session)
        assert (await client.get(f"/agencies/{agency.id}/invoices", headers=auth_headers(outsider))).status_code == 404

    async def test_issue_notice_uses_recipient_email_override(self, client, team, monkeypatch) -> None:
        agency, agency_client, owner, _member, admin = team
        base = f"/agencies/{agency.id}"

        sent = {}

        async def fake_send(*, to, **kwargs):
            sent["to"] = to

        monkeypatch.setattr("binx_api.modules.invoicing.router.send_invoice_issued_email", fake_send)

        created = await client.post(
            f"{base}/invoices",
            json={
                "client_id": str(agency_client.id),
                "line_items": [{"description": "x", "quantity": "1", "unit_price_cents": 100}],
            },
            headers=auth_headers(owner),
        )
        invoice_id = created.json()["id"]

        issued = await client.post(
            f"{base}/invoices/{invoice_id}/issue",
            json={"send_notice": True, "recipient_email": "override@example.com"},
            headers=auth_headers(admin),
        )
        assert issued.status_code == 200
        assert sent["to"] == "override@example.com"


class TestBillingSettings:
    async def test_member_reads_admin_writes(self, client, team) -> None:
        agency, _c, _owner, member, admin = team
        base = f"/agencies/{agency.id}/billing-settings"

        read = await client.get(base, headers=auth_headers(member))
        assert read.status_code == 200
        assert read.json()["currency"] == "USD"

        assert (await client.patch(base, json=_settings_payload(), headers=auth_headers(member))).status_code == 403

        updated = await client.patch(base, json=_settings_payload(), headers=auth_headers(admin))
        assert updated.status_code == 200
        assert updated.json()["currency"] == "EUR"
        assert updated.json()["invoice_prefix"] == "GB-"


def _settings_payload() -> dict:
    return {
        "legal_name": "Globex LLC",
        "address": "1 Main St",
        "tax_id": "GB123",
        "contact_email": "billing@globex.test",
        "currency": "EUR",
        "invoice_prefix": "GB-",
        "next_invoice_number": 5,
        "number_padding": 5,
        "default_due_days": 30,
        "default_tax_rate_percent": "20",
        "payment_instructions": "Wire to ...",
        "default_notes": "Thank you",
    }
