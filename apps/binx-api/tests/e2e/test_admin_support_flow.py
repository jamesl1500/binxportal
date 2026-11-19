"""End-to-end tests for the admin console's support tooling: searching and
inspecting agencies and users, the account/trial actions, support notes, and
the audit trail every one of them leaves.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from binx_api.modules.activity.models import SCOPE_ACCOUNT, SCOPE_AGENCY, VISIBILITY_ADMIN, ActivityLog
from binx_api.modules.billing.service import get_or_create_subscription
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_client_contact, make_project, make_user

pytestmark = pytest.mark.e2e

PASSWORD = "test-password-123"  # tests.factories.make_user's default


@pytest.fixture
async def ctx(db_session):
    admin = await make_user(db_session, full_name="Binx Admin", email="support@binx.example", role="admin")
    owner = await make_user(db_session, full_name="Olivia Owner", email="olivia@pixel.example")
    teammate = await make_user(db_session, full_name="Tess Teammate", email="tess@pixel.example")
    contact = await make_user(db_session, full_name="Dana Client", email="dana@aurora.example")
    pending = await make_user(db_session, full_name="Nina New", email="nina@new.example", is_verified=False)

    pixel = await make_agency(db_session, owner=owner, name="Pixel Forge")
    await add_agency_member(db_session, agency=pixel, user=teammate)
    aurora = await make_client(db_session, agency=pixel, name="Aurora Media")
    await make_client_contact(db_session, agency=pixel, client=aurora, user=contact)
    await make_project(db_session, agency=pixel, created_by=owner, client=aurora, status="active")

    other_owner = await make_user(db_session, full_name="Quinn Quiet", email="quinn@quiet.example")
    quiet = await make_agency(db_session, owner=other_owner, name="Quiet Co 100%")
    return {
        "admin": admin,
        "owner": owner,
        "teammate": teammate,
        "contact": contact,
        "pending": pending,
        "pixel": pixel,
        "quiet": quiet,
        "h": auth_headers(admin),
    }


async def _login(client, email: str) -> dict:
    res = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()


class TestAccess:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/admin/search?q=x"),
            ("get", "/admin/audit"),
            ("get", "/admin/agencies"),
            ("get", "/admin/users"),
            ("post", "/admin/users/00000000-0000-0000-0000-000000000000/password-reset"),
            ("put", "/admin/users/00000000-0000-0000-0000-000000000000/role"),
            ("post", "/admin/agencies/00000000-0000-0000-0000-000000000000/trial"),
        ],
    )
    async def test_agency_owners_are_not_platform_admins(self, client, ctx, method, path) -> None:
        res = await client.request(method, path, json={}, headers=auth_headers(ctx["owner"]))
        assert res.status_code == 403

    async def test_unknown_ids_404(self, client, ctx) -> None:
        missing = "00000000-0000-0000-0000-000000000000"
        assert (await client.get(f"/admin/agencies/{missing}", headers=ctx["h"])).status_code == 404
        assert (await client.get(f"/admin/users/{missing}", headers=ctx["h"])).status_code == 404


class TestSearch:
    async def test_quick_search_finds_agencies_and_people(self, client, ctx) -> None:
        res = await client.get("/admin/search", params={"q": "pixel"}, headers=ctx["h"])
        data = res.json()
        assert [a["name"] for a in data["agencies"]] == ["Pixel Forge"]
        # Owner + teammate both have @pixel.example addresses.
        assert {u["email"] for u in data["users"]} == {"olivia@pixel.example", "tess@pixel.example"}

    async def test_agency_search_matches_owner_email(self, client, ctx) -> None:
        data = (await client.get("/admin/agencies", params={"q": "quinn@"}, headers=ctx["h"])).json()
        assert [a["name"] for a in data["items"]] == ["Quiet Co 100%"]

    async def test_like_wildcards_are_literal(self, client, ctx) -> None:
        data = (await client.get("/admin/agencies", params={"q": "100%"}, headers=ctx["h"])).json()
        assert [a["name"] for a in data["items"]] == ["Quiet Co 100%"]
        data = (await client.get("/admin/agencies", params={"q": "%"}, headers=ctx["h"])).json()
        assert data["total"] == 1

    async def test_agency_filters(self, client, db_session, ctx) -> None:
        sub = await get_or_create_subscription(db_session, ctx["pixel"].id)
        sub.plan = "pro"
        await db_session.commit()

        pro = (await client.get("/admin/agencies", params={"plan": "pro"}, headers=ctx["h"])).json()
        assert [a["name"] for a in pro["items"]] == ["Pixel Forge"]
        free = (await client.get("/admin/agencies", params={"plan": "free"}, headers=ctx["h"])).json()
        assert [a["name"] for a in free["items"]] == ["Quiet Co 100%"]  # no subscription row → Free

        await client.post(
            f"/admin/agencies/{ctx['quiet'].id}/trial", json={"plan": "starter", "days": 7}, headers=ctx["h"]
        )
        trialing = (await client.get("/admin/agencies", params={"trialing": True}, headers=ctx["h"])).json()
        assert [a["name"] for a in trialing["items"]] == ["Quiet Co 100%"]
        not_trialing = (await client.get("/admin/agencies", params={"trialing": False}, headers=ctx["h"])).json()
        assert [a["name"] for a in not_trialing["items"]] == ["Pixel Forge"]

    @pytest.mark.parametrize(
        ("filter_", "expected"),
        [
            ("unverified", {"nina@new.example"}),
            ("admin", {"support@binx.example"}),
            ("portal", {"dana@aurora.example"}),
        ],
    )
    async def test_user_filters(self, client, ctx, filter_, expected) -> None:
        data = (await client.get("/admin/users", params={"filter": filter_}, headers=ctx["h"])).json()
        assert {u["email"] for u in data["items"]} == expected

    async def test_user_search_and_counts(self, client, ctx) -> None:
        data = (await client.get("/admin/users", params={"q": "olivia"}, headers=ctx["h"])).json()
        [olivia] = data["items"]
        assert olivia["agencies"] == 1
        assert olivia["portals"] == 0


class TestAgencyDetail:
    async def test_everything_support_needs_on_one_page(self, client, ctx) -> None:
        data = (await client.get(f"/admin/agencies/{ctx['pixel'].id}", headers=ctx["h"])).json()
        assert data["name"] == "Pixel Forge"
        assert data["owner_email"] == "olivia@pixel.example"
        assert {(m["email"], m["role"]) for m in data["team"]} == {
            ("olivia@pixel.example", "owner"),
            ("tess@pixel.example", "member"),
        }
        assert [(c["name"], c["portal_contacts"]) for c in data["client_list"]] == [("Aurora Media", 1)]
        assert data["active_projects"] == 1
        assert data["subscription"]["plan"] == "free"
        assert data["subscription"]["trialing"] is False


class TestTrials:
    async def test_grant_extends_and_is_visible_to_the_agency(self, client, db_session, ctx) -> None:
        url = f"/admin/agencies/{ctx['pixel'].id}"
        res = await client.post(
            f"{url}/trial", json={"plan": "pro", "days": 21, "reason": "Onboarding call ran long"}, headers=ctx["h"]
        )
        assert res.status_code == 200, res.text
        assert "Pro trial for the next 21 days" in res.json()["message"]

        detail = (await client.get(url, headers=ctx["h"])).json()
        assert detail["plan"] == "pro"
        assert detail["trialing"] is True
        assert detail["subscription"]["trial_plan"] == "pro"
        assert "Onboarding call ran long" in detail["audit"][0]["detail"]
        assert detail["audit"][0]["actor_name"] == "Binx Admin"

        # The agency's owners see it in their own activity feed.
        entries = (
            (
                await db_session.execute(
                    select(ActivityLog).where(
                        ActivityLog.scope == SCOPE_AGENCY, ActivityLog.agency_id == ctx["pixel"].id
                    )
                )
            )
            .scalars()
            .all()
        )
        granted = [e for e in entries if e.event_type == "trial_granted"]
        assert granted and granted[0].visibility == VISIBILITY_ADMIN

    async def test_overrides_the_one_trial_rule(self, client, db_session, ctx) -> None:
        sub = await get_or_create_subscription(db_session, ctx["pixel"].id)
        sub.has_used_trial = True
        await db_session.commit()
        res = await client.post(
            f"/admin/agencies/{ctx['pixel'].id}/trial", json={"plan": "starter", "days": 7}, headers=ctx["h"]
        )
        assert res.status_code == 200

    async def test_wont_downgrade_a_paying_agency(self, client, db_session, ctx) -> None:
        sub = await get_or_create_subscription(db_session, ctx["pixel"].id)
        sub.plan = "pro"
        sub.status = "active"
        sub.stripe_subscription_id = "sub_test_pixel"
        await db_session.commit()
        res = await client.post(
            f"/admin/agencies/{ctx['pixel'].id}/trial", json={"plan": "starter", "days": 7}, headers=ctx["h"]
        )
        assert res.status_code == 400
        assert "already pays for Pro" in res.json()["detail"]
        upgrade = await client.post(
            f"/admin/agencies/{ctx['pixel'].id}/trial", json={"plan": "scale", "days": 7}, headers=ctx["h"]
        )
        assert upgrade.status_code == 200

    @pytest.mark.parametrize(
        "body", [{"plan": "free", "days": 7}, {"plan": "pro", "days": 0}, {"plan": "pro", "days": 91}]
    )
    async def test_validation(self, client, ctx, body) -> None:
        res = await client.post(f"/admin/agencies/{ctx['pixel'].id}/trial", json=body, headers=ctx["h"])
        assert res.status_code == 422

    async def test_end_trial(self, client, ctx) -> None:
        url = f"/admin/agencies/{ctx['pixel'].id}"
        assert (await client.post(f"{url}/trial/end", headers=ctx["h"])).status_code == 409
        await client.post(f"{url}/trial", json={"plan": "pro", "days": 7}, headers=ctx["h"])
        assert (await client.post(f"{url}/trial/end", headers=ctx["h"])).status_code == 200
        detail = (await client.get(url, headers=ctx["h"])).json()
        assert detail["trialing"] is False
        assert detail["plan"] == "free"


class TestUserActions:
    async def test_password_reset_emails_them_and_tells_them(self, client, db_session, ctx, email_outbox) -> None:
        res = await client.post(f"/admin/users/{ctx['owner'].id}/password-reset", headers=ctx["h"])
        assert res.status_code == 200, res.text
        assert [m.to for m in email_outbox] == ["olivia@pixel.example"]
        assert "reset" in email_outbox[0].subject.lower()

        # It shows in the user's own security history...
        mine = await client.get("/activity/me", headers=auth_headers(ctx["owner"]))
        assert "Binx support sent you a password reset link" in mine.text
        # ...and in the console's audit trail for them.
        detail = (await client.get(f"/admin/users/{ctx['owner'].id}", headers=ctx["h"])).json()
        assert detail["audit"][0]["action"] == "password_reset_sent"

    async def test_portal_contacts_get_the_portal_reset_link(self, client, ctx, email_outbox) -> None:
        await client.post(f"/admin/users/{ctx['contact'].id}/password-reset", headers=ctx["h"])
        assert "/portal/reset-password" in email_outbox[0].body

    async def test_verification(self, client, ctx, email_outbox) -> None:
        url = f"/admin/users/{ctx['pending'].id}"
        assert (await client.post(f"{url}/resend-verification", headers=ctx["h"])).status_code == 200
        assert [m.to for m in email_outbox] == ["nina@new.example"]

        # Can't sign in until verified; support can verify by hand.
        blocked = await client.post("/auth/login", json={"email": "nina@new.example", "password": PASSWORD})
        assert blocked.status_code == 403
        assert (await client.post(f"{url}/verify", headers=ctx["h"])).status_code == 200
        await _login(client, "nina@new.example")

        assert (await client.post(f"{url}/verify", headers=ctx["h"])).status_code == 409
        assert (await client.post(f"{url}/resend-verification", headers=ctx["h"])).status_code == 409

    async def test_sign_out_everywhere_kills_refresh_tokens(self, client, ctx) -> None:
        tokens = await _login(client, "olivia@pixel.example")
        detail = (await client.get(f"/admin/users/{ctx['owner'].id}", headers=ctx["h"])).json()
        assert detail["active_sessions"] == 1

        assert (await client.post(f"/admin/users/{ctx['owner'].id}/sign-out", headers=ctx["h"])).status_code == 200
        refreshed = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert refreshed.status_code == 400

    async def test_deactivate_locks_them_out_immediately(self, client, ctx) -> None:
        tokens = await _login(client, "tess@pixel.example")
        live = {"Authorization": f"Bearer {tokens['access_token']}"}
        assert (await client.get("/users/me", headers=live)).status_code == 200

        url = f"/admin/users/{ctx['teammate'].id}"
        res = await client.post(f"{url}/deactivate", json={"reason": "Left the agency"}, headers=ctx["h"])
        assert res.status_code == 200, res.text

        assert (await client.get("/users/me", headers=live)).status_code == 401
        assert (await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 400
        relogin = await client.post("/auth/login", json={"email": "tess@pixel.example", "password": PASSWORD})
        assert relogin.status_code == 403

        detail = (await client.get(url, headers=ctx["h"])).json()
        assert detail["is_active"] is False
        assert "Left the agency" in detail["audit"][0]["detail"]
        assert (await client.post(f"{url}/deactivate", json={}, headers=ctx["h"])).status_code == 409

        assert (await client.post(f"{url}/reactivate", headers=ctx["h"])).status_code == 200
        await _login(client, "tess@pixel.example")

    async def test_cannot_lock_or_demote_yourself(self, client, ctx) -> None:
        me = f"/admin/users/{ctx['admin'].id}"
        assert (await client.post(f"{me}/deactivate", json={}, headers=ctx["h"])).status_code == 400
        assert (await client.put(f"{me}/role", json={"role": "user"}, headers=ctx["h"])).status_code == 400

    async def test_granting_admin_opens_the_console(self, client, db_session, ctx) -> None:
        h = auth_headers(ctx["owner"])
        assert (await client.get("/admin/overview", headers=h)).status_code == 403
        res = await client.put(f"/admin/users/{ctx['owner'].id}/role", json={"role": "admin"}, headers=ctx["h"])
        assert res.status_code == 200
        assert (await client.get("/admin/overview", headers=h)).status_code == 200

        await client.put(f"/admin/users/{ctx['owner'].id}/role", json={"role": "user"}, headers=ctx["h"])
        assert (await client.get("/admin/overview", headers=h)).status_code == 403

        history = (
            (
                await db_session.execute(
                    select(ActivityLog.summary).where(
                        ActivityLog.scope == SCOPE_ACCOUNT, ActivityLog.subject_user_id == ctx["owner"].id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert "You were given Binx admin access" in history


class TestNotesAndAudit:
    async def test_notes_and_the_global_trail(self, client, ctx) -> None:
        h = ctx["h"]
        res = await client.post(
            f"/admin/agencies/{ctx['pixel'].id}/notes", json={"body": "Asked about white-label domains"}, headers=h
        )
        assert res.status_code == 201
        await client.post(f"/admin/users/{ctx['owner'].id}/notes", json={"body": "Prefers email over calls"}, headers=h)
        await client.post(f"/admin/users/{ctx['owner'].id}/password-reset", headers=h)

        trail = (await client.get("/admin/audit", headers=h)).json()
        assert trail["total"] == 3
        assert [e["action"] for e in trail["items"]] == ["password_reset_sent", "note", "note"]

        agency_only = (await client.get("/admin/audit", params={"target_type": "agency"}, headers=h)).json()
        assert [e["detail"] for e in agency_only["items"]] == ["Asked about white-label domains"]
        assert agency_only["items"][0]["target_label"] == "Pixel Forge"

        assert (
            await client.post(f"/admin/users/{ctx['owner'].id}/notes", json={"body": ""}, headers=h)
        ).status_code == 422

    async def test_notes_are_not_shown_to_the_customer(self, client, ctx) -> None:
        await client.post(f"/admin/users/{ctx['owner'].id}/notes", json={"body": "Internal only"}, headers=ctx["h"])
        mine = await client.get("/activity/me", headers=auth_headers(ctx["owner"]))
        assert "Internal only" not in mine.text
