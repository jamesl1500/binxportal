"""Integration tests for Stripe Connect onboarding (client-invoice payments)
— v2 Core Account creation/reuse, always-fresh Account Links, the
v2.core.account.updated event destination's sync, ``get_connect_status``'s
redirect-race reconciliation, and both Connect webhook endpoints' signature
verification + replay protection.

Invoice-payment recording via checkout.session.completed is covered end to
end in tests/e2e/test_client_portal_flow.py, since it also needs the portal
membership/invoice fixtures that live there.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from binx_api.core import stripe_client, stripe_events
from binx_api.modules.invoicing import service
from tests.factories import make_agency, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.integration


def make_fake_v2_account(
    account_id: str, *, card_payments_active: bool, payouts_active: bool, has_merchant: bool = True
) -> SimpleNamespace:
    """Builds a v2 Core Account shaped just enough for
    ``sync_connect_status`` to read — ``configuration.merchant`` is ``None``
    until the Merchant configuration has actually been applied (see
    ``stripe_connect_details_submitted``'s mapping in service.py)."""
    merchant = None
    if has_merchant:
        merchant = SimpleNamespace(
            capabilities=SimpleNamespace(
                card_payments=SimpleNamespace(status="active" if card_payments_active else "restricted"),
                stripe_balance=SimpleNamespace(
                    payouts=SimpleNamespace(status="active" if payouts_active else "restricted")
                ),
            )
        )
    return SimpleNamespace(id=account_id, configuration=SimpleNamespace(merchant=merchant))


class TestStripeNotConfigured:
    async def test_start_connect_onboarding_503s(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.start_connect_onboarding(db_session, agency)
        assert exc.value.status_code == 503


class TestStartConnectOnboarding:
    async def test_creates_account_once_and_always_mints_a_fresh_link(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        create_calls: list[dict] = []

        async def fake_create_connect_account(params):
            create_calls.append(params)
            return SimpleNamespace(id="acct_123")

        link_calls: list[dict] = []

        async def fake_create_account_link(params):
            link_calls.append(params)
            return SimpleNamespace(url=f"https://connect.stripe.test/link-{len(link_calls)}")

        monkeypatch.setattr(stripe_client, "create_connect_account", fake_create_connect_account)
        monkeypatch.setattr(stripe_client, "create_account_link", fake_create_account_link)

        url1 = await service.start_connect_onboarding(db_session, agency)
        assert url1 == "https://connect.stripe.test/link-1"
        assert len(create_calls) == 1
        assert create_calls[0]["dashboard"] == "full"
        assert create_calls[0]["configuration"]["merchant"]["capabilities"]["card_payments"]["requested"] is True
        assert create_calls[0]["defaults"]["responsibilities"] == {
            "fees_collector": "stripe",
            "losses_collector": "stripe",
        }

        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        assert settings_row.stripe_connect_account_id == "acct_123"

        # Second call: the account is reused, but a fresh link is minted —
        # Account Links expire in minutes, so a stored one is never reusable.
        url2 = await service.start_connect_onboarding(db_session, agency)
        assert url2 == "https://connect.stripe.test/link-2"
        assert len(create_calls) == 1
        assert len(link_calls) == 2
        assert link_calls[1]["account"] == "acct_123"
        assert link_calls[1]["use_case"]["account_onboarding"]["configurations"] == ["merchant"]


class TestSyncConnectStatus:
    async def test_updates_flags_and_sets_onboarded_at_once(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        await db_session.commit()

        account = make_fake_v2_account("acct_123", card_payments_active=True, payouts_active=False)
        updated = await service.sync_connect_status(db_session, account)
        assert updated is not None
        assert updated.stripe_connect_charges_enabled is True
        assert updated.stripe_connect_details_submitted is True
        first_onboarded_at = updated.stripe_connect_onboarded_at
        assert first_onboarded_at is not None

        # A later event doesn't reset the onboarded_at timestamp.
        account_again = make_fake_v2_account("acct_123", card_payments_active=True, payouts_active=True)
        updated_again = await service.sync_connect_status(db_session, account_again)
        assert updated_again.stripe_connect_onboarded_at == first_onboarded_at
        assert updated_again.stripe_connect_payouts_enabled is True

    async def test_merchant_not_yet_applied_reads_as_not_submitted(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        await db_session.commit()

        account = make_fake_v2_account("acct_123", card_payments_active=False, payouts_active=False, has_merchant=False)
        updated = await service.sync_connect_status(db_session, account)
        assert updated is not None
        assert updated.stripe_connect_details_submitted is False
        assert updated.stripe_connect_charges_enabled is False
        assert updated.stripe_connect_onboarded_at is None

    async def test_unrecognised_account_is_a_no_op(self, db_session) -> None:
        result = await service.sync_connect_status(
            db_session, make_fake_v2_account("acct_unknown", card_payments_active=True, payouts_active=True)
        )
        assert result is None


class TestGetConnectStatus:
    async def test_refresh_reconciles_a_pending_row(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        await db_session.commit()

        async def fake_retrieve(account_id, params=None):
            assert account_id == "acct_123"
            assert params == {"include": ["configuration.merchant"]}
            return make_fake_v2_account("acct_123", card_payments_active=True, payouts_active=True)

        monkeypatch.setattr(stripe_client, "retrieve_connect_account", fake_retrieve)

        result = await service.get_connect_status(db_session, agency, refresh=True)
        assert result.stripe_connect_charges_enabled is True

    async def test_skips_the_live_call_once_already_enabled(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        settings_row.stripe_connect_charges_enabled = True
        await db_session.commit()

        async def fail_if_called(account_id, params=None):
            raise AssertionError("should not have called Stripe — already enabled")

        monkeypatch.setattr(stripe_client, "retrieve_connect_account", fail_if_called)

        result = await service.get_connect_status(db_session, agency, refresh=True)
        assert result.stripe_connect_charges_enabled is True


class TestConnectWebhookRouter:
    async def test_bad_signature_is_rejected(self, client, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_webhook_secret", "whsec_test_fake")
        body, _ = sign_stripe_payload({"id": "evt_x", "type": "checkout.session.completed"}, "whsec_wrong")
        resp = await client.post("/webhooks/stripe/connect", content=body, headers={"stripe-signature": "t=1,v1=bad"})
        assert resp.status_code == 400

    async def test_unconfigured_returns_503(self, client) -> None:
        resp = await client.post("/webhooks/stripe/connect", content=b"{}", headers={"stripe-signature": "t=1,v1=x"})
        assert resp.status_code == 503


class TestConnectAccountWebhookRouter:
    """The v2 Core Account event destination — a **thin** event, so unlike
    ``/connect`` above there's no embedded object to sign a fake payload
    around; the handler calls ``fetch_related_object_async()`` to get the
    current Account, which is mocked at the ``stripe_client`` boundary (same
    "one monkeypatchable function per real network call" pattern as every
    other Stripe call in this module — see core/stripe_client.py)."""

    async def test_bad_signature_is_rejected(self, client, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_account_webhook_secret", "whsec_test_fake")
        body, _ = sign_stripe_payload({"id": "evt_x", "type": "v2.core.account.updated"}, "whsec_wrong")
        resp = await client.post(
            "/webhooks/stripe/connect-account", content=body, headers={"stripe-signature": "t=1,v1=bad"}
        )
        assert resp.status_code == 400

    async def test_unconfigured_returns_503(self, client) -> None:
        resp = await client.post(
            "/webhooks/stripe/connect-account", content=b"{}", headers={"stripe-signature": "t=1,v1=x"}
        )
        assert resp.status_code == 503

    async def test_account_updated_syncs_status_and_replay_is_a_no_op(
        self, db_session, client, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_connect_account_webhook_secret", "whsec_test_fake")
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        settings_row = await service.get_or_create_billing_settings(db_session, agency)
        settings_row.stripe_connect_account_id = "acct_123"
        await db_session.commit()

        async def fake_fetch_related_object_async():
            return make_fake_v2_account("acct_123", card_payments_active=True, payouts_active=False)

        fake_notification = SimpleNamespace(
            id="evt_connect_1",
            type="v2.core.account.updated",
            related_object=SimpleNamespace(id="acct_123"),
            fetch_related_object_async=fake_fetch_related_object_async,
        )
        # stripe_events.py does `from stripe_client import
        # parse_connect_account_event_notification`, binding its own name —
        # patching stripe_client's copy wouldn't reach the call site.
        monkeypatch.setattr(
            stripe_events, "parse_connect_account_event_notification", lambda payload, sig, secret: fake_notification
        )

        first = await client.post(
            "/webhooks/stripe/connect-account", content=b"{}", headers={"stripe-signature": "t=1,v1=x"}
        )
        assert first.status_code == 200
        await db_session.refresh(settings_row)
        assert settings_row.stripe_connect_charges_enabled is True

        # A redelivered event (same id) must not error — the ledger
        # short-circuits before the handler (and fake_fetch, if it were
        # tracked) would re-run.
        second = await client.post(
            "/webhooks/stripe/connect-account", content=b"{}", headers={"stripe-signature": "t=1,v1=x"}
        )
        assert second.status_code == 200
