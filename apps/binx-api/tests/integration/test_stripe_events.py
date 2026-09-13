"""Integration tests for core/stripe_events.py's replay-protection ledger —
specifically that it's atomic with the handler's own side effects, not
committed unconditionally up front.

This is a regression test for a real bug: a client's Stripe payment webhook
was received and verified (so the ledger recorded it), but the handler that
actually records the ``InvoicePayment`` never completed — and because the
ledger row had already been committed, Stripe's retry of the same event was
silently treated as "already handled" and never reprocessed, leaving the
invoice permanently stuck unpaid despite Stripe showing the charge as
succeeded. See verify_and_dedupe's docstring for the fix (flush, not commit —
the ledger row only becomes durable alongside the handler's own commit).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from binx_api.core import stripe_client
from binx_api.core.stripe_events import StripeWebhookEvent
from binx_api.modules.invoicing import service, webhooks_router
from tests.factories import make_agency, make_invoice, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.integration


class TestReplayProtectionIsAtomicWithTheHandler:
    async def test_a_failed_handler_leaves_no_ledger_row_so_stripe_can_retry(
        self, db_session, client, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_test_fake")
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invoice = await make_invoice(db_session, agency=agency, created_by=owner)
        # _apply_payments (called from add_payment) never touches a draft
        # invoice's status — must be issued first for payment to flip it paid.
        invoice = await service.issue_invoice(db_session, invoice, issued_by=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        await db_session.commit()

        payload = {
            "id": "evt_flaky_1",
            "type": "checkout.session.completed",
            "account": "acct_123",
            "data": {
                "object": {
                    "id": "cs_test_1",
                    "mode": "payment",
                    "payment_intent": "pi_test_1",
                    "amount_total": invoice.total_cents,
                    "metadata": {
                        "invoice_id": str(invoice.id),
                        "agency_id": str(agency.id),
                        "paid_by_user_id": str(owner.id),
                    },
                }
            },
        }
        body, signature = sign_stripe_payload(payload, "whsec_test_fake")

        real_handler = webhooks_router._handle_checkout_completed
        call_count = {"n": 0}

        async def flaky_then_real(db, session):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("simulated transient failure (e.g. a DB hiccup)")
            await real_handler(db, session)

        monkeypatch.setattr(webhooks_router, "_handle_checkout_completed", flaky_then_real)

        # First delivery: the handler blows up. The ledger must NOT have
        # committed a row for it — otherwise the retry below would be a
        # silent no-op and the invoice would stay unpaid forever, which is
        # exactly the bug this test guards against.
        with pytest.raises(RuntimeError):
            await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})

        # Production's real `get_db` (core/database.py) wraps the session in
        # `async with async_session_factory() as session`, so an exception
        # propagating out of the endpoint rolls it back automatically before
        # the connection is released. This test's `app` fixture overrides
        # `get_db` to hand out the shared `db_session` directly (so the
        # request and the assertions below can see the same data) — that
        # override doesn't wrap the yield in its own try/rollback, so this
        # line reproduces the cleanup the real dependency would have done.
        await db_session.rollback()

        result = await db_session.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.stripe_event_id == "evt_flaky_1")
        )
        assert result.scalar_one_or_none() is None

        await db_session.refresh(invoice)
        assert invoice.status != "paid"

        # Stripe's retry (Stripe always retries a non-2xx) redelivers the
        # identical event. This time the handler succeeds, so both the
        # payment AND the ledger row commit together.
        second = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        assert second.status_code == 200
        assert call_count["n"] == 2

        await db_session.refresh(invoice)
        assert invoice.status == "paid"

        result = await db_session.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.stripe_event_id == "evt_flaky_1")
        )
        assert result.scalar_one_or_none() is not None

        # A THIRD delivery of the now-successfully-handled event is a true
        # replay — the handler must not run again.
        third = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": signature})
        assert third.status_code == 200
        assert call_count["n"] == 2
