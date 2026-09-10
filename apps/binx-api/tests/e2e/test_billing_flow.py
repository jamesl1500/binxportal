"""End-to-end tests for the /agencies/{id}/plan router — reading the current
plan + usage, the plan catalog, switching plans (owner only), and the 402 a
create hits once its plan cap is reached.
"""

from __future__ import annotations

import dataclasses

import pytest

from binx_api.modules.billing import models as billing_models
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def agency_ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Mia Member")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    await add_agency_member(db_session, agency=agency, user=member)
    return agency, owner, member


class TestPlanReads:
    async def test_current_plan_and_catalog(self, client, agency_ctx) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)

        plan = await client.get(f"/agencies/{agency.id}/plan", headers=h)
        assert plan.status_code == 200, plan.text
        body = plan.json()
        assert body["plan"] == "free"
        assert body["limits"]["key"] == "free"
        assert set(body["usage"]) == {"clients", "active_projects", "leads", "team_members"}
        assert body["usage"]["team_members"] == 2

        catalog = await client.get(f"/agencies/{agency.id}/plan/catalog", headers=h)
        assert [p["key"] for p in catalog.json()] == billing_models.PLAN_ORDER


class TestChangePlan:
    async def test_owner_can_switch_member_cannot(self, client, agency_ctx) -> None:
        agency, owner, member = agency_ctx

        forbidden = await client.post(f"/agencies/{agency.id}/plan", json={"plan": "pro"}, headers=auth_headers(member))
        assert forbidden.status_code == 403

        switched = await client.post(f"/agencies/{agency.id}/plan", json={"plan": "pro"}, headers=auth_headers(owner))
        assert switched.status_code == 200, switched.text
        assert switched.json()["plan"] == "pro"

        again = await client.get(f"/agencies/{agency.id}/plan", headers=auth_headers(owner))
        assert again.json()["plan"] == "pro"


class TestLimitEnforcement:
    async def test_client_creation_402s_at_the_cap(self, client, agency_ctx, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, _member = agency_ctx
        monkeypatch.setitem(
            billing_models.PLANS, "free", dataclasses.replace(billing_models.PLANS["free"], max_clients=1)
        )
        h = auth_headers(owner)

        first = await client.post(f"/agencies/{agency.id}/clients", json={"name": "Client A"}, headers=h)
        assert first.status_code == 201, first.text

        blocked = await client.post(f"/agencies/{agency.id}/clients", json={"name": "Client B"}, headers=h)
        assert blocked.status_code == 402
        assert "Settings → Plan" in blocked.json()["detail"]

        # Bumping the plan clears the block.
        await client.post(f"/agencies/{agency.id}/plan", json={"plan": "pro"}, headers=h)
        ok = await client.post(f"/agencies/{agency.id}/clients", json={"name": "Client B"}, headers=h)
        assert ok.status_code == 201, ok.text
