"""End-to-end tests for GET /admin/overview — the Binx team's platform
numbers on the admin home."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from binx_api.modules.billing.service import get_or_create_subscription
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_client_contact, make_project, make_user

pytestmark = pytest.mark.e2e


async def _subscribe(db, agency, *, plan: str, paid: bool = True, status: str = "active", trial_plan=None):
    sub = await get_or_create_subscription(db, agency.id)
    sub.plan = plan
    sub.status = status
    sub.stripe_subscription_id = f"sub_{agency.id.hex[:12]}" if paid else None
    if trial_plan:
        sub.trial_plan = trial_plan
        sub.trial_ends_at = datetime.now(UTC) + timedelta(days=7)
    await db.commit()


@pytest.fixture
async def platform(db_session):
    admin = await make_user(db_session, full_name="Binx Admin", role="admin")
    o1 = await make_user(db_session, full_name="Olivia Owner", email="olivia@pixel.example")
    o2 = await make_user(db_session, full_name="Theo Owner")
    o3 = await make_user(db_session, full_name="Uma Owner")
    teammate = await make_user(db_session, full_name="Tess Teammate")
    contact = await make_user(db_session, full_name="Dana Client")

    pixel = await make_agency(db_session, owner=o1, name="Pixel Forge")
    await add_agency_member(db_session, agency=pixel, user=teammate)
    client = await make_client(db_session, agency=pixel, name="Aurora")
    await make_client_contact(db_session, agency=pixel, client=client, user=contact)
    await make_project(db_session, agency=pixel, created_by=o1, client=client, status="active")
    await make_project(db_session, agency=pixel, created_by=o1, client=client, status="archived")

    north = await make_agency(db_session, owner=o2, name="Northlight")
    await make_agency(db_session, owner=o3, name="Quiet Co")  # no subscription row → Free

    await _subscribe(db_session, pixel, plan="pro")  # paying $149
    await _subscribe(db_session, north, plan="free", paid=False, trial_plan="starter")  # trialing Starter
    return {"admin": admin, "owner": o1, "pixel": pixel}


class TestAdminOverview:
    async def test_platform_admins_only(self, client, platform) -> None:
        assert (await client.get("/admin/overview")).status_code == 401
        res = await client.get("/admin/overview", headers=auth_headers(platform["owner"]))
        assert res.status_code == 403  # an agency owner is not a Binx admin

    async def test_counts(self, client, platform) -> None:
        res = await client.get("/admin/overview", headers=auth_headers(platform["admin"]))
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["agencies_total"] == 3
        assert data["agencies_new_7d"] == 3
        assert data["users_total"] == 6
        assert data["staff_users"] == 4  # three owners + a teammate
        assert data["portal_users"] == 1
        assert data["clients_total"] == 1
        assert data["projects_active"] == 1  # the archived one doesn't count

    async def test_plan_mix_and_revenue(self, client, platform) -> None:
        data = (await client.get("/admin/overview", headers=auth_headers(platform["admin"]))).json()

        mix = {row["key"]: row for row in data["plan_mix"]}
        assert [row["key"] for row in data["plan_mix"]] == ["free", "starter", "pro", "scale"]
        assert mix["free"]["agencies"] == 1  # Quiet Co, no subscription row
        assert mix["starter"] == {"key": "starter", "name": "Starter", "agencies": 1, "trialing": 1}
        assert mix["pro"]["agencies"] == 1
        assert mix["scale"]["agencies"] == 0

        assert data["paying_agencies"] == 1
        assert data["mrr_cents"] == 14900
        assert data["trialing_agencies"] == 1

    async def test_unpaid_and_canceled_are_not_revenue(self, client, db_session, platform) -> None:
        await _subscribe(db_session, platform["pixel"], plan="pro", status="canceled")
        data = (await client.get("/admin/overview", headers=auth_headers(platform["admin"]))).json()
        assert data["paying_agencies"] == 0
        assert data["mrr_cents"] == 0

    async def test_weekly_signups(self, client, platform) -> None:
        data = (await client.get("/admin/overview", headers=auth_headers(platform["admin"]))).json()
        weeks = data["signups_by_week"]
        assert len(weeks) == 8
        assert weeks == sorted(weeks, key=lambda w: w["week_start"])  # oldest first
        assert weeks[-1]["agencies"] == 3
        assert weeks[-1]["users"] == 6
        assert sum(w["agencies"] for w in weeks[:-1]) == 0  # empty weeks are filled in

    async def test_recent_agencies(self, client, platform) -> None:
        data = (await client.get("/admin/overview", headers=auth_headers(platform["admin"]))).json()
        recent = {a["name"]: a for a in data["recent_agencies"]}
        assert set(recent) == {"Pixel Forge", "Northlight", "Quiet Co"}

        pixel = recent["Pixel Forge"]
        assert pixel["owner_email"] == "olivia@pixel.example"
        assert pixel["members"] == 2
        assert pixel["clients"] == 1
        assert pixel["plan_name"] == "Pro"
        assert recent["Northlight"]["trialing"] is True
        assert recent["Northlight"]["plan"] == "starter"
