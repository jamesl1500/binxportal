"""Payouts (invoicing/payouts.py): the Account Session behind Stripe's
embedded Payouts component, for owners and admins of an agency that has
connected Stripe."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
import stripe

from binx_api.core import stripe_client
from binx_api.modules.invoicing import service
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(stripe_client.settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(stripe_client.settings, "stripe_publishable_key", "pk_test_fake")
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _connect(db_session, agency) -> None:
    billing = await service.get_or_create_billing_settings(db_session, agency)
    billing.stripe_connect_account_id = "acct_northlight"
    await db_session.commit()


def _path(agency) -> str:
    return f"/agencies/{agency.id}/billing-settings/stripe/payouts-session"


class TestPayoutsSession:
    async def test_opens_the_payouts_component_on_the_agencys_own_account(
        self, client, db_session, ctx, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner = ctx
        await _connect(db_session, agency)
        captured: dict = {}

        async def fake_session(params):
            captured.update(params)
            return SimpleNamespace(client_secret="accs_secret", expires_at=1_900_000_000)

        monkeypatch.setattr(stripe_client, "create_account_session", fake_session)
        resp = await client.post(_path(agency), headers=auth_headers(owner))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["client_secret"] == "accs_secret"
        assert body["publishable_key"] == "pk_test_fake"
        assert body["expires_at"].startswith("2030-03-17")

        assert captured["account"] == "acct_northlight"
        payouts = captured["components"]["payouts"]
        assert payouts["enabled"] is True
        assert payouts["features"] == {
            "standard_payouts": True,
            "instant_payouts": True,
            "edit_payout_schedule": True,
            "external_account_collection": True,
        }
        assert captured["components"]["payout_details"] == {"enabled": True}

    async def test_needs_stripe_connected_first(self, client, ctx) -> None:
        agency, owner = ctx
        resp = await client.post(_path(agency), headers=auth_headers(owner))
        assert resp.status_code == 409
        assert "Connect Stripe" in resp.json()["detail"]

    async def test_only_owners_and_admins(self, client, db_session, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, _owner = ctx
        await _connect(db_session, agency)

        async def fake_session(_params):
            return SimpleNamespace(client_secret="accs_secret", expires_at=1_900_000_000)

        monkeypatch.setattr(stripe_client, "create_account_session", fake_session)
        member = await make_user(db_session, email="m@northlight.example", full_name="Mo Member")
        await add_agency_member(db_session, agency=agency, user=member)
        admin = await make_user(db_session, email="a@northlight.example", full_name="Ada Admin")
        await add_agency_member(db_session, agency=agency, user=admin, role="admin")

        assert (await client.post(_path(agency), headers=auth_headers(member))).status_code == 403
        assert (await client.post(_path(agency), headers=auth_headers(admin))).status_code == 200

    async def test_stripe_refusing_is_a_clear_reported_error(
        self, client, db_session, ctx, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner = ctx
        await _connect(db_session, agency)

        async def refuse(_params):
            raise stripe.InvalidRequestError("No such account: 'acct_northlight'", param="account")

        monkeypatch.setattr(stripe_client, "create_account_session", refuse)
        resp = await client.post(_path(agency), headers=auth_headers(owner))
        assert resp.status_code == 502
        assert resp.json()["code"] == "stripe_payouts_unavailable"
        assert resp.json().get("reference")

    async def test_unconfigured_stripe_is_a_503(self, client, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner = ctx
        monkeypatch.setattr(stripe_client.settings, "stripe_publishable_key", None)
        resp = await client.post(_path(agency), headers=auth_headers(owner))
        assert resp.status_code == 503
