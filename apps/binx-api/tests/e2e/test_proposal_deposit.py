"""End-to-end: paying the deposit straight after signing (proposals/deposit.py).
The signing page learns where the deposit stands, the signer pays it through
Stripe Checkout on the agency's own account, and the payment (from the
return page or the webhook) starts the work that was waiting on it."""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from binx_api.core import stripe_client
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import InvoicePayment
from binx_api.modules.proposals.models import ACCEPTANCE_BLOCKED, ProposalAcceptance
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}
# 30% of $10,000.00.
DEPOSIT = 300_000


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _take_payments(db_session, agency) -> None:
    billing = await invoicing_service.get_or_create_billing_settings(db_session, agency)
    billing.stripe_connect_account_id = "acct_deposit"
    billing.stripe_connect_charges_enabled = True
    await db_session.commit()


async def _signed(client, agency, owner, **fields) -> dict:
    """A lead's proposal with a 30% deposit and a project, signed on its link."""
    lead = (
        await client.post(
            f"/agencies/{agency.id}/leads",
            json={"name": "Fjord & Field", "contact_name": "Jane", "contact_email": "jane@fjord.example"},
            headers=auth_headers(owner),
        )
    ).json()
    payload = {
        "title": "Brand refresh",
        "lead_id": lead["id"],
        "recipient_email": "jane@fjord.example",
        "deposit_percent": "30",
        "create_project_on_accept": True,
        "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 1_000_000}],
    } | fields
    created = await client.post(f"/agencies/{agency.id}/proposals", json=payload, headers=auth_headers(owner))
    assert created.status_code == 201, created.text
    sent = (
        await client.post(
            f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
        )
    ).json()
    signed = await client.post(
        f"/proposals/public/{_token(sent['share_url'])}/sign",
        json={
            "signer_name": "Jane Prospect",
            "signer_email": "jane@fjord.example",
            "consent": True,
            "document_hash": sent["document_hash"],
        },
        headers=CHROME,
    )
    assert signed.status_code == 200, signed.text
    return sent


async def _public(client, sent: dict) -> dict:
    return (await client.get(f"/proposals/public/{_token(sent['share_url'])}", headers=CHROME)).json()


async def _acceptance(client, agency, owner, sent: dict) -> dict:
    staff = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}", headers=auth_headers(owner))
    return staff.json()["acceptance"]


def _session(invoice_id: str, agency_id: str, **overrides):
    metadata = {"invoice_id": invoice_id, "agency_id": agency_id, "proposal_id": "p", "platform_fee_cents": "3750"}
    fields = {
        "id": "cs_deposit",
        "mode": "payment",
        "status": "complete",
        "payment_status": "paid",
        "amount_total": DEPOSIT,
        "payment_intent": "pi_deposit",
        "metadata": SimpleNamespace(to_dict=lambda: dict(metadata)),
    }
    return SimpleNamespace(**(fields | overrides))


class TestWhereItStands:
    async def test_after_signing_the_deposit_is_due_and_payable_online(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)

        deposit = (await _public(client, sent))["deposit"]
        assert deposit["status"] == "due"
        assert deposit["amount_cents"] == DEPOSIT
        assert deposit["currency"] == "USD"
        assert deposit["pay_online"] is True
        assert deposit["invoice_number"]
        # The share link never hands out internal ids.
        assert deposit["invoice_id"] is None

    async def test_without_stripe_it_is_due_but_not_payable_here(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _signed(client, agency, owner)
        deposit = (await _public(client, sent))["deposit"]
        assert (deposit["status"], deposit["pay_online"]) == ("due", False)
        resp = await client.post(f"/proposals/public/{_token(sent['share_url'])}/deposit/checkout")
        assert resp.status_code == 409
        assert "isn't set up" in resp.json()["detail"]

    async def test_no_deposit_no_block(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _signed(client, agency, owner, deposit_percent=None)
        assert (await _public(client, sent))["deposit"] is None
        unsent = await client.get(f"/proposals/public/{_token(sent['share_url'])}")
        assert unsent.json()["deposit"] is None

    async def test_it_waits_for_the_countersignature(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner, requires_countersign=True)
        deposit = (await _public(client, sent))["deposit"]
        assert deposit["status"] == "awaiting_countersign"
        assert deposit["amount_cents"] == DEPOSIT
        resp = await client.post(f"/proposals/public/{_token(sent['share_url'])}/deposit/checkout")
        assert resp.status_code == 409
        assert "countersigned" in resp.json()["detail"]

    async def test_while_being_set_up_and_when_setup_stopped(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        sent = await _signed(client, agency, owner)
        row = await db_session.scalar(select(ProposalAcceptance).where(ProposalAcceptance.proposal_id == sent["id"]))
        row.deposit_invoice_id = None
        row.status = "in_progress"
        await db_session.commit()
        assert (await _public(client, sent))["deposit"]["status"] == "preparing"
        resp = await client.post(f"/proposals/public/{_token(sent['share_url'])}/deposit/checkout")
        assert resp.status_code == 409
        assert "being prepared" in resp.json()["detail"]

        row.status = ACCEPTANCE_BLOCKED
        await db_session.commit()
        assert (await _public(client, sent))["deposit"]["status"] == "unavailable"

    async def test_the_portal_read_links_to_the_invoice(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        customer = await make_client(db_session, agency=agency, name="Acme")
        contact = await make_user(db_session, email="dana@acme.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=customer, user=contact)
        created = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={
                "title": "Phase two",
                "client_id": str(customer.id),
                "recipient_email": "dana@acme.example",
                "deposit_percent": "50",
                "line_items": [{"description": "Work", "quantity": "1", "unit_price_cents": 200_000}],
            },
            headers=auth_headers(owner),
        )
        sent = (
            await client.post(
                f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
            )
        ).json()
        signed = await client.post(
            f"/portal/proposals/{sent['id']}/sign",
            json={"consent": True, "document_hash": sent["document_hash"]},
            headers=auth_headers(contact),
        )
        assert signed.status_code == 200
        read = (await client.get(f"/portal/proposals/{sent['id']}", headers=auth_headers(contact))).json()
        assert read["deposit"]["status"] == "due"
        assert read["deposit"]["amount_cents"] == 100_000
        invoice = await client.get(f"/portal/invoices/{read['deposit']['invoice_id']}", headers=auth_headers(contact))
        assert invoice.status_code == 200


class TestPaying:
    async def test_checkout_is_for_the_deposit_on_the_agencys_account_and_returns_to_the_link(
        self, client, ctx, db_session, monkeypatch
    ) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)
        captured: dict = {}

        async def fake_create(params, *, stripe_account=None):
            captured.update(params=params, account=stripe_account)
            return SimpleNamespace(url="https://checkout.stripe.test/deposit")

        monkeypatch.setattr(invoicing_service.stripe_client, "create_checkout_session", fake_create)
        token = _token(sent["share_url"])
        resp = await client.post(f"/proposals/public/{token}/deposit/checkout")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"checkout_url": "https://checkout.stripe.test/deposit"}

        params = captured["params"]
        assert captured["account"] == "acct_deposit"
        assert params["line_items"][0]["price_data"]["unit_amount"] == DEPOSIT
        # Binx's 1.25% comes out of the agency's side.
        assert params["payment_intent_data"] == {"application_fee_amount": 3_750}
        assert params["metadata"]["proposal_id"] == sent["id"]
        assert "paid_by_user_id" not in params["metadata"]
        assert params["success_url"].endswith(
            f"/proposals/public?token={token}&deposit=paid&session_id={{CHECKOUT_SESSION_ID}}"
        )
        assert params["cancel_url"].endswith(f"/proposals/public?token={token}&deposit=cancelled")

    async def test_the_return_page_records_it_and_the_project_starts(
        self, client, ctx, db_session, monkeypatch
    ) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)
        acceptance = await _acceptance(client, agency, owner, sent)
        assert acceptance["status"] == "awaiting_deposit"
        assert acceptance["project_id"] is None

        async def fake_retrieve(session_id, *, stripe_account=None):
            assert (session_id, stripe_account) == ("cs_deposit", "acct_deposit")
            return _session(acceptance["deposit_invoice_id"], str(agency.id))

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)
        token = _token(sent["share_url"])
        resp = await client.post(f"/proposals/public/{token}/deposit/confirm", json={"session_id": "cs_deposit"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["outcome"] == "paid"
        assert resp.json()["proposal"]["deposit"]["status"] == "paid"

        payment = await db_session.scalar(
            select(InvoicePayment).where(InvoicePayment.stripe_payment_intent_id == "pi_deposit")
        )
        assert payment.amount_cents == DEPOSIT
        assert payment.recorded_by_id is None
        after = await _acceptance(client, agency, owner, sent)
        assert after["status"] == "done"
        assert after["project_id"] is not None

        # Confirming again (a reload) records nothing twice.
        again = await client.post(f"/proposals/public/{token}/deposit/confirm", json={"session_id": "cs_deposit"})
        assert again.json()["outcome"] == "paid"
        payments = await db_session.execute(
            select(InvoicePayment).where(InvoicePayment.invoice_id == after["deposit_invoice_id"])
        )
        assert len(payments.scalars().all()) == 1
        # And it can't be paid twice.
        assert (await client.post(f"/proposals/public/{token}/deposit/checkout")).status_code == 409

    async def test_a_session_for_something_else_is_refused(self, client, ctx, db_session, monkeypatch) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)

        async def fake_retrieve(session_id, *, stripe_account=None):
            return _session("00000000-0000-0000-0000-000000000000", str(agency.id))

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)
        resp = await client.post(
            f"/proposals/public/{_token(sent['share_url'])}/deposit/confirm", json={"session_id": "cs_other"}
        )
        assert resp.status_code == 404
        assert (await _public(client, sent))["deposit"]["status"] == "due"

    async def test_an_unfinished_checkout_leaves_it_due(self, client, ctx, db_session, monkeypatch) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)
        acceptance = await _acceptance(client, agency, owner, sent)

        async def fake_retrieve(session_id, *, stripe_account=None):
            return _session(acceptance["deposit_invoice_id"], str(agency.id), status="open", payment_status="unpaid")

        monkeypatch.setattr(invoicing_service.stripe_client, "retrieve_checkout_session", fake_retrieve)
        resp = await client.post(
            f"/proposals/public/{_token(sent['share_url'])}/deposit/confirm", json={"session_id": "cs_deposit"}
        )
        assert resp.json()["outcome"] == "open"
        assert resp.json()["proposal"]["deposit"]["status"] == "due"

    async def test_the_webhook_records_it_too(self, client, ctx, db_session, monkeypatch) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        sent = await _signed(client, agency, owner)
        acceptance = await _acceptance(client, agency, owner, sent)
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_deposit")
        payload = {
            "id": "evt_deposit",
            "type": "checkout.session.completed",
            "account": "acct_deposit",
            "data": {
                "object": {
                    "object": "checkout.session",
                    "id": "cs_deposit",
                    "mode": "payment",
                    "status": "complete",
                    "payment_status": "paid",
                    "amount_total": DEPOSIT,
                    "payment_intent": "pi_deposit_hook",
                    "metadata": {
                        "invoice_id": acceptance["deposit_invoice_id"],
                        "agency_id": str(agency.id),
                        "proposal_id": sent["id"],
                        "platform_fee_cents": "3750",
                    },
                }
            },
        }
        body, signature = sign_stripe_payload(payload, "whsec_deposit")
        resp = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        assert resp.status_code == 200
        assert (await _public(client, sent))["deposit"]["status"] == "paid"
        assert (await _acceptance(client, agency, owner, sent))["status"] == "done"

    async def test_the_email_code_guards_the_deposit_too(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        await _take_payments(db_session, agency)
        lead = (
            await client.post(
                f"/agencies/{agency.id}/leads",
                json={"name": "Gated", "contact_email": "g@fjord.example"},
                headers=auth_headers(owner),
            )
        ).json()
        created = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={
                "title": "Gated",
                "lead_id": lead["id"],
                "recipient_email": "g@fjord.example",
                "deposit_percent": "30",
                "require_email_code": True,
                "line_items": [{"description": "Work", "quantity": "1", "unit_price_cents": 1000}],
            },
            headers=auth_headers(owner),
        )
        sent = (
            await client.post(
                f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
            )
        ).json()
        token = _token(sent["share_url"])
        for path, body in [("/deposit/checkout", None), ("/deposit/confirm", {"session_id": "cs_x"})]:
            resp = await client.post(f"/proposals/public/{token}{path}", json=body)
            assert resp.status_code == 403, path
