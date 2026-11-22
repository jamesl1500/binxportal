"""Binx's 1.25% platform fee on online invoice payments, end to end:

- portal checkout charges it as the application fee, on top of nothing the
  client sees;
- a recorded Stripe payment keeps the fees Stripe actually charged (read
  from the charge's balance transaction), with safe fallbacks;
- staff see the fees and what they keep; the client portal never does.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
import stripe

from binx_api.core import stripe_client
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.service import issue_invoice
from tests.conftest import auth_headers
from tests.e2e.test_client_portal_flow import _invite_and_accept
from tests.factories import make_agency, make_client, make_invoice, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.e2e

# One $2,500.00 line, so the fees are easy to check by hand:
# Binx 1.25% = $31.25, Stripe's estimate 2.9% + 30c = $72.80.
TOTAL = 250_000
PLATFORM_FEE = 3_125
STRIPE_ESTIMATE = 7_280


@pytest.fixture
async def fee_setup(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner", email="olivia@fees.example")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client = await make_client(db_session, agency=agency, name="Northwind Traders")
    invoice = await make_invoice(
        db_session, agency=agency, created_by=owner, client=client, line_items=[("Brand identity", "1", TOTAL)]
    )
    await issue_invoice(db_session, invoice, issued_by=owner)
    billing_settings = await invoicing_service.get_or_create_billing_settings(db_session, agency)
    billing_settings.stripe_connect_account_id = "acct_fees"
    billing_settings.stripe_connect_charges_enabled = True
    await db_session.commit()
    return {
        "owner": owner,
        "agency_id": str(agency.id),
        "client_id": client.id,
        "invoice_id": str(invoice.id),
        "agency": agency,
    }


async def _contact(client, db_session, email_outbox, s, email):
    contact_user, _ = await _invite_and_accept(
        client, db_session, email_outbox, s["agency"].id, s["client_id"], s["owner"], email
    )
    return contact_user


def _paid_event(s, contact_id: str, *, event_id: str = "evt_fee_1", metadata_fee: str | None = str(PLATFORM_FEE)):
    metadata = {"invoice_id": s["invoice_id"], "agency_id": s["agency_id"], "paid_by_user_id": contact_id}
    if metadata_fee is not None:
        metadata["platform_fee_cents"] = metadata_fee
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "account": "acct_fees",
        "data": {
            "object": {
                "object": "checkout.session",
                "id": f"cs_{event_id}",
                "mode": "payment",
                "status": "complete",
                "payment_status": "paid",
                "amount_total": TOTAL,
                "payment_intent": f"pi_{event_id}",
                "metadata": metadata,
            }
        },
    }


def _intent(*fee_details: tuple[str, int]):
    """A PaymentIntent with ``latest_charge.balance_transaction`` expanded."""
    details = [SimpleNamespace(type=kind, amount=amount) for kind, amount in fee_details]
    return SimpleNamespace(latest_charge=SimpleNamespace(balance_transaction=SimpleNamespace(fee_details=details)))


async def _deliver(client, monkeypatch, payload) -> None:
    monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_fees")
    body, signature = sign_stripe_payload(payload, "whsec_fees")
    resp = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
    assert resp.status_code == 200, resp.text


class TestCheckout:
    async def test_charges_the_platform_fee_as_the_application_fee(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "pay@northwind.example")
        captured: dict = {}

        async def fake_create(params, *, stripe_account=None):
            captured["params"] = params
            captured["account"] = stripe_account
            return SimpleNamespace(url="https://checkout.stripe.test/s")

        monkeypatch.setattr(invoicing_service.stripe_client, "create_checkout_session", fake_create)
        resp = await client.post(f"/portal/invoices/{s['invoice_id']}/pay", headers=auth_headers(contact))
        assert resp.status_code == 200, resp.text

        params = captured["params"]
        assert captured["account"] == "acct_fees"
        # The client pays the invoice balance, nothing more.
        assert params["line_items"][0]["price_data"]["unit_amount"] == TOTAL
        assert params["payment_intent_data"] == {"application_fee_amount": PLATFORM_FEE}
        assert params["metadata"]["platform_fee_cents"] == str(PLATFORM_FEE)

    async def test_the_fee_follows_a_partly_paid_balance(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        owner_headers = auth_headers(s["owner"])
        manual = await client.post(
            f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}/payments",
            json={"amount_cents": 50_000, "paid_on": "2026-11-21", "method": "bank_transfer"},
            headers=owner_headers,
        )
        assert manual.status_code == 201, manual.text
        contact = await _contact(client, db_session, email_outbox, s, "pay-partial@northwind.example")
        captured: dict = {}

        async def fake_create(params, *, stripe_account=None):
            captured["params"] = params
            return SimpleNamespace(url="https://checkout.stripe.test/s")

        monkeypatch.setattr(invoicing_service.stripe_client, "create_checkout_session", fake_create)
        await client.post(f"/portal/invoices/{s['invoice_id']}/pay", headers=auth_headers(contact))
        # 1.25% of the $2,000.00 still due.
        assert captured["params"]["payment_intent_data"] == {"application_fee_amount": 2_500}


class TestRecordingFees:
    async def test_records_the_fees_stripe_charged(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "fees-real@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")
        lookups: list = []

        async def fake_intent(intent_id, params=None, *, stripe_account=None):
            lookups.append((intent_id, params, stripe_account))
            return _intent(("stripe_fee", 7_530), ("application_fee", PLATFORM_FEE))

        monkeypatch.setattr(stripe_client, "retrieve_payment_intent", fake_intent)
        await _deliver(client, monkeypatch, _paid_event(s, str(contact.id)))

        assert lookups == [("pi_evt_fee_1", {"expand": ["latest_charge.balance_transaction"]}, "acct_fees")]
        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        assert staff["status"] == "paid"
        payment = staff["payments"][0]
        assert payment["platform_fee_cents"] == PLATFORM_FEE
        assert payment["stripe_fee_cents"] == 7_530
        assert payment["stripe_fee_estimated"] is False
        assert payment["net_cents"] == TOTAL - PLATFORM_FEE - 7_530

        fees = staff["fees"]
        assert fees["platform_fee_bps"] == 125
        assert fees["online_payments_enabled"] is True
        assert fees["if_paid_online"] is None  # nothing left to pay
        assert fees["collected_online"] == {
            "gross_cents": TOTAL,
            "stripe_fee_cents": 7_530,
            "platform_fee_cents": PLATFORM_FEE,
            "net_cents": TOTAL - PLATFORM_FEE - 7_530,
            "stripe_fee_estimated": False,
        }

        listed = (
            await client.get(
                f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}/payments", headers=auth_headers(s["owner"])
            )
        ).json()
        assert listed[0]["net_cents"] == TOTAL - PLATFORM_FEE - 7_530

    async def test_the_client_portal_never_sees_the_fees(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "fees-private@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")

        async def fake_intent(intent_id, params=None, *, stripe_account=None):
            return _intent(("stripe_fee", 7_530), ("application_fee", PLATFORM_FEE))

        monkeypatch.setattr(stripe_client, "retrieve_payment_intent", fake_intent)
        await _deliver(client, monkeypatch, _paid_event(s, str(contact.id)))

        portal = (await client.get(f"/portal/invoices/{s['invoice_id']}", headers=auth_headers(contact))).json()
        assert portal["status"] == "paid"
        assert portal["fees"] is None
        payment = portal["payments"][0]
        assert payment["platform_fee_cents"] is None
        assert payment["stripe_fee_cents"] is None
        assert payment["net_cents"] is None

    async def test_falls_back_when_stripe_cant_be_read(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "fees-down@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")

        async def failing_intent(intent_id, params=None, *, stripe_account=None):
            raise stripe.APIConnectionError("Stripe is down")

        monkeypatch.setattr(stripe_client, "retrieve_payment_intent", failing_intent)
        await _deliver(client, monkeypatch, _paid_event(s, str(contact.id)))

        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        # The payment is still recorded; the fee is the one the session set,
        # and Stripe's fee is estimated until someone checks Stripe.
        assert staff["status"] == "paid"
        payment = staff["payments"][0]
        assert payment["platform_fee_cents"] == PLATFORM_FEE
        assert payment["stripe_fee_cents"] == STRIPE_ESTIMATE
        assert payment["stripe_fee_estimated"] is True
        assert staff["fees"]["collected_online"]["stripe_fee_estimated"] is True

    async def test_an_async_payment_without_a_balance_transaction_yet(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "fees-async@northwind.example")
        monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")

        async def unexpanded_intent(intent_id, params=None, *, stripe_account=None):
            return SimpleNamespace(latest_charge=SimpleNamespace(balance_transaction="txn_pending"))

        monkeypatch.setattr(stripe_client, "retrieve_payment_intent", unexpanded_intent)
        await _deliver(client, monkeypatch, _paid_event(s, str(contact.id)))

        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        assert staff["payments"][0]["platform_fee_cents"] == PLATFORM_FEE
        assert staff["payments"][0]["stripe_fee_estimated"] is True

    async def test_a_session_from_before_the_fee_owes_none(
        self, client, db_session, email_outbox, fee_setup, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Stripe isn't configured here (the test default), so no lookup runs;
        a session created before the fee carries no fee in its metadata."""
        s = fee_setup
        contact = await _contact(client, db_session, email_outbox, s, "fees-legacy@northwind.example")

        async def unexpected(*args, **kwargs):
            raise AssertionError("no Stripe call without a secret key")

        monkeypatch.setattr(stripe_client, "retrieve_payment_intent", unexpected)
        await _deliver(client, monkeypatch, _paid_event(s, str(contact.id), metadata_fee=None))

        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        payment = staff["payments"][0]
        assert payment["platform_fee_cents"] == 0
        assert payment["net_cents"] == TOTAL - STRIPE_ESTIMATE


class TestStaffView:
    async def test_estimates_what_the_agency_keeps_before_payment(self, client, fee_setup) -> None:
        s = fee_setup
        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        fees = staff["fees"]
        assert fees["stripe_estimate_bps"] == 290
        assert fees["stripe_estimate_fixed_cents"] == 30
        assert fees["collected_online"] is None
        assert fees["if_paid_online"] == {
            "gross_cents": TOTAL,
            "stripe_fee_cents": STRIPE_ESTIMATE,
            "platform_fee_cents": PLATFORM_FEE,
            "net_cents": TOTAL - STRIPE_ESTIMATE - PLATFORM_FEE,
            "stripe_fee_estimated": True,
        }

    async def test_manual_payments_carry_no_fees(self, client, fee_setup) -> None:
        s = fee_setup
        resp = await client.post(
            f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}/payments",
            json={"amount_cents": 100_000, "paid_on": "2026-11-21", "method": "check"},
            headers=auth_headers(s["owner"]),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        payment = body["payments"][0]
        assert payment["platform_fee_cents"] is None
        assert payment["net_cents"] is None
        assert body["fees"]["collected_online"] is None
        # The estimate covers only what's still due.
        assert body["fees"]["if_paid_online"]["gross_cents"] == 150_000
        assert body["fees"]["if_paid_online"]["platform_fee_cents"] == 1_875

    async def test_a_void_invoice_has_nothing_to_estimate(self, client, fee_setup) -> None:
        s = fee_setup
        resp = await client.post(
            f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}/void", headers=auth_headers(s["owner"])
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["fees"]["if_paid_online"] is None

    async def test_says_when_online_payment_isnt_set_up(self, client, db_session, fee_setup) -> None:
        s = fee_setup
        billing_settings = await invoicing_service.get_or_create_billing_settings(db_session, s["agency"])
        billing_settings.stripe_connect_charges_enabled = False
        await db_session.commit()
        staff = (
            await client.get(f"/agencies/{s['agency_id']}/invoices/{s['invoice_id']}", headers=auth_headers(s["owner"]))
        ).json()
        assert staff["fees"]["online_payments_enabled"] is False
        # Still shown, so staff can see what online payment would cost.
        assert staff["fees"]["if_paid_online"]["net_cents"] == TOTAL - STRIPE_ESTIMATE - PLATFORM_FEE
