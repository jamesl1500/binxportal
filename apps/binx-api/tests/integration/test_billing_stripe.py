"""Integration tests for Stripe-backed platform billing: Checkout Session
creation, Billing Portal flow_data branching, the change_plan guard once
Stripe is configured, the four webhook-driven state mutators, and the
platform webhook endpoint's signature verification + replay protection.

The Stripe SDK itself is never called — every test either configures
``core.stripe_client``'s wrapper functions with a fake, or (for the guard/
mutator tests) hands the mutators fake ``SimpleNamespace`` objects shaped like
the real Stripe response fields they read. See core/stripe_client.py's module
docstring for why the wrapper functions, not ``stripe.*``, are the mocking
seam.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from binx_api.core import stripe_client
from binx_api.modules.ai import client as ai_client
from binx_api.modules.billing import service
from tests.factories import make_agency, make_user
from tests.stripe_helpers import sign_stripe_payload

pytestmark = pytest.mark.integration


def _configure_stripe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(stripe_client.settings, "stripe_price_id_starter", "price_starter")
    monkeypatch.setattr(stripe_client.settings, "stripe_price_id_pro", "price_pro")
    monkeypatch.setattr(stripe_client.settings, "stripe_price_id_scale", "price_scale")


class TestStripeNotConfigured:
    """Without a Stripe key, these must fail cleanly (503) rather than
    attempting a real network call with the wrapper's fallback bogus key."""

    async def test_start_checkout_503s(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.start_checkout(db_session, agency, plan="pro")
        assert exc.value.status_code == 503

    async def test_start_billing_portal_503s(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.start_billing_portal(db_session, agency)
        assert exc.value.status_code == 503


class TestStartCheckout:
    async def test_rejects_free_plan(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.start_checkout(db_session, agency, plan="free")
        assert exc.value.status_code == 400

    async def test_creates_customer_and_session(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        async def fake_create_customer(params):
            assert params["metadata"]["agency_id"] == str(agency.id)
            return SimpleNamespace(id="cus_123")

        captured: dict = {}

        async def fake_create_checkout_session(params, *, stripe_account=None):
            captured.update(params)
            assert stripe_account is None
            return SimpleNamespace(url="https://checkout.stripe.test/abc")

        monkeypatch.setattr(stripe_client, "create_customer", fake_create_customer)
        monkeypatch.setattr(stripe_client, "create_checkout_session", fake_create_checkout_session)

        url = await service.start_checkout(db_session, agency, plan="pro")
        assert url == "https://checkout.stripe.test/abc"
        assert captured["mode"] == "subscription"
        assert captured["line_items"] == [{"price": "price_pro", "quantity": 1}]
        assert captured["customer"] == "cus_123"
        # No return_to passed — falls back to the original Settings destination.
        assert captured["success_url"] == "http://frontend.test/settings/plan?checkout=success"
        assert captured["cancel_url"] == "http://frontend.test/settings/plan?checkout=cancel"

        subscription = await service.get_or_create_subscription(db_session, agency.id)
        assert subscription.stripe_customer_id == "cus_123"

    async def test_return_to_redirects_success_and_cancel_there_instead(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Onboarding uses this so a brand-new agency lands back on /dashboard
        # after paying, instead of Settings > Plan.
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        async def fake_create_customer(params):
            return SimpleNamespace(id="cus_123")

        captured: dict = {}

        async def fake_create_checkout_session(params, *, stripe_account=None):
            captured.update(params)
            return SimpleNamespace(url="https://checkout.stripe.test/abc")

        monkeypatch.setattr(stripe_client, "create_customer", fake_create_customer)
        monkeypatch.setattr(stripe_client, "create_checkout_session", fake_create_checkout_session)

        await service.start_checkout(db_session, agency, plan="pro", return_to="/dashboard")
        assert captured["success_url"] == "http://frontend.test/dashboard?checkout=success"
        assert captured["cancel_url"] == "http://frontend.test/dashboard?checkout=cancel"

    def test_return_to_rejects_anything_but_a_same_origin_relative_path(self) -> None:
        # This value is embedded directly into a Stripe-hosted redirect, so
        # it's validated at the schema layer before it ever reaches the
        # service — protocol-relative ("//host") and absolute URLs must
        # never pass, or this becomes an open redirect.
        from pydantic import ValidationError

        from binx_api.modules.billing.schemas import PlanCheckoutRequest

        for safe in ["/dashboard", "/settings/plan", "/onboarding/three", None]:
            PlanCheckoutRequest(plan="pro", return_to=safe)

        for unsafe in ["//evil.example.com", "https://evil.example.com", "dashboard"]:
            with pytest.raises(ValidationError):
                PlanCheckoutRequest(plan="pro", return_to=unsafe)

    async def test_rejects_when_already_subscribed(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_subscription_id = "sub_existing"
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await service.start_checkout(db_session, agency, plan="pro")
        assert exc.value.status_code == 400


class TestStartBillingPortal:
    async def test_requires_existing_customer(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.start_billing_portal(db_session, agency)
        assert exc.value.status_code == 409

    async def test_plain_portal_link_has_no_flow_data(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        await db_session.commit()

        captured: dict = {}

        async def fake_portal(params):
            captured.update(params)
            return SimpleNamespace(url="https://billing.stripe.test/portal")

        monkeypatch.setattr(stripe_client, "create_billing_portal_session", fake_portal)
        url = await service.start_billing_portal(db_session, agency)
        assert url == "https://billing.stripe.test/portal"
        assert "flow_data" not in captured

    async def test_cancel_flow_requires_active_subscription(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await service.start_billing_portal(db_session, agency, target_plan="free")
        assert exc.value.status_code == 409

    async def test_cancel_flow_data(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        subscription.stripe_subscription_id = "sub_123"
        await db_session.commit()

        captured: dict = {}

        async def fake_portal(params):
            captured.update(params)
            return SimpleNamespace(url="https://billing.stripe.test/portal")

        monkeypatch.setattr(stripe_client, "create_billing_portal_session", fake_portal)
        await service.start_billing_portal(db_session, agency, target_plan="free")
        assert captured["flow_data"] == {
            "type": "subscription_cancel",
            "subscription_cancel": {"subscription": "sub_123"},
        }

    async def test_change_plan_flow_data(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        subscription.stripe_subscription_id = "sub_123"
        await db_session.commit()

        async def fake_retrieve_subscription(subscription_id):
            assert subscription_id == "sub_123"
            return SimpleNamespace(items=SimpleNamespace(data=[SimpleNamespace(id="si_123")]))

        captured: dict = {}

        async def fake_portal(params):
            captured.update(params)
            return SimpleNamespace(url="https://billing.stripe.test/portal")

        monkeypatch.setattr(stripe_client, "retrieve_subscription", fake_retrieve_subscription)
        monkeypatch.setattr(stripe_client, "create_billing_portal_session", fake_portal)

        await service.start_billing_portal(db_session, agency, target_plan="scale")
        assert captured["flow_data"] == {
            "type": "subscription_update",
            "subscription_update": {
                "subscription": "sub_123",
                "items": [{"id": "si_123", "price": "price_scale", "quantity": 1}],
            },
        }


class TestChangePlanGuard:
    """Once Stripe is configured, the old direct-switch endpoint can no
    longer grant a paid plan for free — see billing/service.py::change_plan.
    With no Stripe key (the default in every other test in this suite),
    nothing here changes; test_billing_service.py's existing coverage proves
    that."""

    async def test_blocked_once_stripe_configured(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.change_plan(db_session, agency, new_plan="pro", actor=owner)
        assert exc.value.status_code == 400

    async def test_blocked_downgrading_an_existing_subscriber_directly(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.plan = "pro"
        subscription.stripe_subscription_id = "sub_123"
        await db_session.commit()

        with pytest.raises(HTTPException) as exc:
            await service.change_plan(db_session, agency, new_plan="free", actor=owner)
        assert exc.value.status_code == 400

    async def test_free_to_free_noop_is_still_allowed(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.change_plan(db_session, agency, new_plan="free", actor=owner)
        assert subscription.plan == "free"


class TestWebhookMutators:
    async def test_sync_from_checkout_completed_sets_the_plan(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        await db_session.commit()

        item = SimpleNamespace(price=SimpleNamespace(id="price_pro"), current_period_end=2_000_000_000, id="si_1")
        live_subscription = SimpleNamespace(
            id="sub_123",
            status="active",
            cancel_at_period_end=False,
            items=SimpleNamespace(data=[item]),
            customer="cus_123",
        )

        async def fake_retrieve_subscription(subscription_id):
            assert subscription_id == "sub_123"
            return live_subscription

        monkeypatch.setattr(stripe_client, "retrieve_subscription", fake_retrieve_subscription)

        session = SimpleNamespace(
            customer="cus_123",
            subscription="sub_123",
            metadata=SimpleNamespace(to_dict=lambda: {"agency_id": str(agency.id)}),
        )
        await service.sync_from_checkout_completed(db_session, session)

        await db_session.refresh(subscription)
        assert subscription.plan == "pro"
        assert subscription.status == "active"
        assert subscription.stripe_subscription_id == "sub_123"
        assert subscription.stripe_price_id == "price_pro"
        assert subscription.current_period_end is not None

    async def test_sync_from_subscription_event_downgrade_clamps_ai(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        subscription.plan = "pro"
        await db_session.commit()

        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        ai_settings.monthly_budget_cents = 18_000
        ai_settings.daily_user_request_cap = 180
        await db_session.commit()

        item = SimpleNamespace(price=SimpleNamespace(id="price_starter"), current_period_end=2_000_000_000, id="si_1")
        stripe_subscription = SimpleNamespace(
            id="sub_123",
            status="active",
            cancel_at_period_end=True,
            items=SimpleNamespace(data=[item]),
            customer="cus_123",
        )
        await service.sync_from_subscription_event(db_session, stripe_subscription)

        await db_session.refresh(subscription)
        assert subscription.plan == "starter"
        assert subscription.cancel_at_period_end is True

        from binx_api.modules.billing import models as billing_models

        starter_limits = billing_models.PLANS["starter"]
        await db_session.refresh(ai_settings)
        assert ai_settings.monthly_budget_cents == starter_limits.ai_monthly_budget_cents
        assert ai_settings.daily_user_request_cap == starter_limits.ai_daily_user_cap

    async def test_sync_from_subscription_deleted_reverts_to_free(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        subscription.stripe_subscription_id = "sub_123"
        subscription.plan = "pro"
        await db_session.commit()

        stripe_subscription = SimpleNamespace(customer="cus_123")
        await service.sync_from_subscription_deleted(db_session, stripe_subscription)

        await db_session.refresh(subscription)
        assert subscription.plan == "free"
        assert subscription.status == "canceled"
        assert subscription.stripe_subscription_id is None

    async def test_mark_payment_failed(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        await db_session.commit()

        await service.mark_payment_failed(db_session, "cus_123")
        await db_session.refresh(subscription)
        assert subscription.status == "past_due"

    async def test_unrecognised_customer_is_a_no_op(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        # No agency has this customer id — must not raise.
        await service.mark_payment_failed(db_session, "cus_unknown")


class TestPlatformWebhookRouter:
    async def test_bad_signature_is_rejected(self, client, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(stripe_client.settings, "stripe_webhook_secret", "whsec_test_fake")
        body, _ = sign_stripe_payload({"id": "evt_x", "type": "invoice.payment_failed"}, "whsec_wrong")
        resp = await client.post("/webhooks/stripe/platform", content=body, headers={"stripe-signature": "t=1,v1=bad"})
        assert resp.status_code == 400

    async def test_unconfigured_returns_503(self, client) -> None:
        resp = await client.post("/webhooks/stripe/platform", content=b"{}", headers={"stripe-signature": "t=1,v1=x"})
        assert resp.status_code == 503

    async def test_replayed_event_is_a_no_op(self, db_session, client, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure_stripe(monkeypatch)
        monkeypatch.setattr(stripe_client.settings, "stripe_webhook_secret", "whsec_test_fake")
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        subscription = await service.get_or_create_subscription(db_session, agency.id)
        subscription.stripe_customer_id = "cus_123"
        await db_session.commit()

        payload = {
            "id": "evt_platform_1",
            "type": "invoice.payment_failed",
            "data": {"object": {"customer": "cus_123"}},
        }
        body, signature = sign_stripe_payload(payload, "whsec_test_fake")

        first = await client.post("/webhooks/stripe/platform", content=body, headers={"stripe-signature": signature})
        assert first.status_code == 200
        await db_session.refresh(subscription)
        assert subscription.status == "past_due"

        # Flip it back by hand, then replay the SAME event — must not re-apply.
        subscription.status = "active"
        await db_session.commit()

        second = await client.post("/webhooks/stripe/platform", content=body, headers={"stripe-signature": signature})
        assert second.status_code == 200
        await db_session.refresh(subscription)
        assert subscription.status == "active"
