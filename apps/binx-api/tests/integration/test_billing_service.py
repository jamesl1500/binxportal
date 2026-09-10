"""Integration tests for ``binx_api.modules.billing.service`` — lazy
subscription creation, plan-limit resolution, the 402 boundary, the
owned-agency cap, and the AI-settings re-clamp on a downgrade.

The autouse ``_generous_plan_limits`` fixture (conftest.py) lifts every count
cap, so these tests monkeypatch the specific plan back to real values.
"""

from __future__ import annotations

import dataclasses

import pytest
from fastapi import HTTPException

from binx_api.modules.ai import client as ai_client
from binx_api.modules.billing import models as billing_models
from binx_api.modules.billing import service
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


def _set_plan(monkeypatch: pytest.MonkeyPatch, key: str, **overrides) -> None:
    plan = dataclasses.replace(billing_models.PLANS[key], **overrides)
    monkeypatch.setitem(billing_models.PLANS, key, plan)


class TestSubscription:
    async def test_lazy_create_defaults_to_free(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        sub = await service.get_or_create_subscription(db_session, agency.id)
        assert sub.plan == "free"
        assert sub.status == "active"

        again = await service.get_or_create_subscription(db_session, agency.id)
        assert again.id == sub.id

    async def test_get_plan_limits_follows_the_row(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await service.change_plan(db_session, agency, new_plan="pro", actor=owner)

        limits = await service.get_plan_limits(db_session, agency.id)
        assert limits.key == "pro"


class TestAssertWithinLimit:
    def test_blocks_once_count_reaches_limit(self) -> None:
        service.assert_within_limit(2, 3, resource="clients", plan_name="Free")  # ok
        with pytest.raises(HTTPException) as exc:
            service.assert_within_limit(3, 3, resource="clients", plan_name="Free")
        assert exc.value.status_code == 402
        assert "Free plan" in exc.value.detail

    def test_none_limit_is_unlimited(self) -> None:
        service.assert_within_limit(9_999, None, resource="leads", plan_name="Scale")


class TestOwnedAgencies:
    async def test_free_owner_capped_at_one(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_plan(monkeypatch, "free", max_owned_agencies=1)
        owner = await make_user(db_session)
        await make_agency(db_session, owner=owner)

        with pytest.raises(HTTPException) as exc:
            await make_agency(db_session, owner=owner, name="Second Co")
        assert exc.value.status_code == 402

    async def test_a_pro_agency_raises_the_owner_cap(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_plan(monkeypatch, "free", max_owned_agencies=1)
        _set_plan(monkeypatch, "pro", max_owned_agencies=5)
        owner = await make_user(db_session)
        first = await make_agency(db_session, owner=owner)
        await service.change_plan(db_session, first, new_plan="pro", actor=owner)

        assert await service.max_owned_agencies_for(db_session, owner) == 5
        await make_agency(db_session, owner=owner, name="Second Co")  # no longer blocked


class TestChangePlan:
    async def test_downgrade_clamps_ai_settings(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _set_plan(monkeypatch, "pro", ai_monthly_budget_cents=20_000, ai_daily_user_cap=200)
        _set_plan(monkeypatch, "free", ai_monthly_budget_cents=1_000, ai_daily_user_cap=15)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        await service.change_plan(db_session, agency, new_plan="pro", actor=owner)
        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        ai_settings.monthly_budget_cents = 18_000
        ai_settings.daily_user_request_cap = 180
        await db_session.commit()

        await service.change_plan(db_session, agency, new_plan="free", actor=owner)
        await db_session.refresh(ai_settings)
        assert ai_settings.monthly_budget_cents == 1_000
        assert ai_settings.daily_user_request_cap == 15

    async def test_unknown_plan_is_rejected(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        with pytest.raises(HTTPException) as exc:
            await service.change_plan(db_session, agency, new_plan="platinum", actor=owner)
        assert exc.value.status_code == 400
