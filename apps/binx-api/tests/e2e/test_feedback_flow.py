"""End-to-end tests for product feedback: the /feedback submitter endpoints
(open feedback + the new-account check-in pulse) and the /admin/feedback
triage endpoints the Binx team uses.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from binx_api.modules.feedback import service as feedback_service
from binx_api.modules.notifications.models import CATEGORY_PRODUCT, Notification
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def ctx(db_session):
    """An agency owner, one of their portal clients, and a Binx platform admin."""
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client = await make_client(db_session, agency=agency, name="Aurora Media")
    contact_user = await make_user(db_session, full_name="Dana Client")
    await make_client_contact(db_session, agency=agency, client=client, user=contact_user)
    admin = await make_user(db_session, full_name="Binx Admin", role="admin")
    return {"owner": owner, "agency": agency, "client": client, "contact": contact_user, "admin": admin}


def _bug(**overrides) -> dict:
    return {
        "surface": "app",
        "kind": "bug",
        "message": "The invoice page spinner never stops",
        "page_path": "/invoices/123",
        "user_agent": "Mozilla/5.0 test",
        "viewport": "1440x900",
        **overrides,
    }


async def _notifications(db_session, user) -> list[Notification]:
    rows = await db_session.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.category == CATEGORY_PRODUCT)
    )
    return list(rows.scalars().all())


async def _age(db_session, user, days: int) -> None:
    user.created_at = datetime.now(UTC) - timedelta(days=days)
    await db_session.commit()


class TestSubmitting:
    async def test_staff_feedback_is_filed_under_their_agency(self, client, db_session, ctx) -> None:
        res = await client.post(
            "/feedback", json=_bug(agency_id=str(ctx["agency"].id), rating=2), headers=auth_headers(ctx["owner"])
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["status"] == "new"
        assert body["kind"] == "bug"
        assert body["rating"] == 2
        assert "internal_note" not in body

        admin_view = await client.get(f"/admin/feedback/{body['id']}", headers=auth_headers(ctx["admin"]))
        detail = admin_view.json()
        assert detail["agency_name"] == "Pixel Forge"
        assert detail["client_id"] is None
        assert detail["user_email"] == ctx["owner"].email
        assert detail["page_path"] == "/invoices/123"
        assert detail["viewport"] == "1440x900"

    async def test_portal_feedback_takes_context_from_the_membership(self, client, ctx) -> None:
        res = await client.post(
            "/feedback",
            json={"surface": "portal", "kind": "idea", "message": "Let me download all invoices at once"},
            headers=auth_headers(ctx["contact"]),
        )
        assert res.status_code == 201, res.text
        detail = (await client.get(f"/admin/feedback/{res.json()['id']}", headers=auth_headers(ctx["admin"]))).json()
        assert detail["surface"] == "portal"
        assert detail["agency_name"] == "Pixel Forge"
        assert detail["client_name"] == "Aurora Media"

    async def test_portal_surface_needs_portal_access(self, client, ctx) -> None:
        res = await client.post(
            "/feedback", json={"surface": "portal", "kind": "idea", "message": "hi"}, headers=auth_headers(ctx["owner"])
        )
        assert res.status_code == 403

    async def test_cannot_file_under_someone_elses_agency(self, client, db_session, ctx) -> None:
        stranger = await make_user(db_session)
        res = await client.post("/feedback", json=_bug(agency_id=str(ctx["agency"].id)), headers=auth_headers(stranger))
        assert res.status_code == 404

    @pytest.mark.parametrize(
        "overrides",
        [{"message": "   "}, {"message": ""}, {"kind": "pulse"}, {"kind": "rant"}, {"rating": 6}, {"surface": "x"}],
    )
    async def test_validation(self, client, ctx, overrides) -> None:
        res = await client.post("/feedback", json=_bug(**overrides), headers=auth_headers(ctx["owner"]))
        assert res.status_code == 422

    async def test_requires_sign_in(self, client) -> None:
        assert (await client.post("/feedback", json=_bug())).status_code == 401

    async def test_hourly_limit(self, client, ctx, monkeypatch) -> None:
        monkeypatch.setattr(feedback_service, "SUBMIT_LIMIT_PER_HOUR", 2)
        h = auth_headers(ctx["owner"])
        assert (await client.post("/feedback", json=_bug(), headers=h)).status_code == 201
        assert (await client.post("/feedback", json=_bug(), headers=h)).status_code == 201
        assert (await client.post("/feedback", json=_bug(), headers=h)).status_code == 429

    async def test_binx_admins_are_alerted_in_app_and_by_email(
        self, client, db_session, ctx, email_outbox, monkeypatch
    ) -> None:
        monkeypatch.setattr(feedback_service.settings, "feedback_inbox_email", "feedback@binx.example")
        res = await client.post("/feedback", json=_bug(), headers=auth_headers(ctx["owner"]))
        assert res.status_code == 201

        alerts = await _notifications(db_session, ctx["admin"])
        assert len(alerts) == 1
        assert alerts[0].title == "New bug report from Olivia Owner"
        assert alerts[0].link == f"/admin/feedback/{res.json()['id']}"
        # Nobody else hears about it.
        assert await _notifications(db_session, ctx["contact"]) == []

        assert [m.to for m in email_outbox] == ["feedback@binx.example"]
        assert "spinner never stops" in email_outbox[0].body
        assert f"/admin/feedback/{res.json()['id']}" in email_outbox[0].body

    async def test_no_inbox_email_when_unconfigured(self, client, ctx, email_outbox, monkeypatch) -> None:
        monkeypatch.setattr(feedback_service.settings, "feedback_inbox_email", None)
        await client.post("/feedback", json=_bug(), headers=auth_headers(ctx["owner"]))
        assert email_outbox == []


class TestMyFeedback:
    async def test_lists_only_your_own(self, client, ctx) -> None:
        await client.post("/feedback", json=_bug(message="mine"), headers=auth_headers(ctx["owner"]))
        await client.post(
            "/feedback",
            json={"surface": "portal", "kind": "praise", "message": "theirs"},
            headers=auth_headers(ctx["contact"]),
        )
        mine = (await client.get("/feedback/mine", headers=auth_headers(ctx["owner"]))).json()
        assert [f["message"] for f in mine] == ["mine"]


class TestTriage:
    async def test_only_platform_admins(self, client, ctx) -> None:
        h = auth_headers(ctx["owner"])  # an agency *owner* is still not a Binx admin
        assert (await client.get("/admin/feedback", headers=h)).status_code == 403
        assert (await client.get("/admin/feedback/summary", headers=h)).status_code == 403

    async def test_filters(self, client, ctx) -> None:
        await client.post("/feedback", json=_bug(message="Broken export"), headers=auth_headers(ctx["owner"]))
        await client.post(
            "/feedback",
            json={"surface": "portal", "kind": "idea", "message": "Dark mode please"},
            headers=auth_headers(ctx["contact"]),
        )
        h = auth_headers(ctx["admin"])

        everything = (await client.get("/admin/feedback", headers=h)).json()
        assert everything["total"] == 2

        portal = (await client.get("/admin/feedback", params={"surface": "portal"}, headers=h)).json()
        assert [f["message"] for f in portal["items"]] == ["Dark mode please"]

        bugs = (await client.get("/admin/feedback", params={"kind": "bug"}, headers=h)).json()
        assert [f["message"] for f in bugs["items"]] == ["Broken export"]

        search = (await client.get("/admin/feedback", params={"q": "dana"}, headers=h)).json()
        assert search["total"] == 1  # matches the submitter's name

        assert (await client.get("/admin/feedback", params={"status": "bogus"}, headers=h)).status_code == 422

    async def test_reply_notifies_and_emails_the_submitter(self, client, db_session, ctx, email_outbox) -> None:
        created = (await client.post("/feedback", json=_bug(), headers=auth_headers(ctx["owner"]))).json()
        h = auth_headers(ctx["admin"])

        res = await client.patch(
            f"/admin/feedback/{created['id']}",
            json={"status": "planned", "response": "Thanks! Fix ships Friday.", "internal_note": "INV-42"},
            headers=h,
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "planned"
        assert res.json()["internal_note"] == "INV-42"
        assert res.json()["responded_at"] is not None

        notes = await _notifications(db_session, ctx["owner"])
        assert len(notes) == 1
        assert notes[0].title == "The Binx team replied to your bug report"
        assert notes[0].link == "/feedback"

        assert [m.to for m in email_outbox] == [ctx["owner"].email]
        assert "Fix ships Friday" in email_outbox[0].body

        # The submitter sees the reply but never the internal note.
        mine = (await client.get("/feedback/mine", headers=auth_headers(ctx["owner"]))).json()
        assert mine[0]["response"] == "Thanks! Fix ships Friday."
        assert mine[0]["status"] == "planned"
        assert "internal_note" not in mine[0]

    async def test_no_reply_email_without_permission_to_contact(self, client, ctx, email_outbox) -> None:
        created = (
            await client.post("/feedback", json=_bug(allow_contact=False), headers=auth_headers(ctx["owner"]))
        ).json()
        await client.patch(
            f"/admin/feedback/{created['id']}", json={"response": "Got it"}, headers=auth_headers(ctx["admin"])
        )
        assert email_outbox == []

    async def test_portal_reply_links_to_the_portal_history(self, client, db_session, ctx) -> None:
        created = (
            await client.post(
                "/feedback",
                json={"surface": "portal", "kind": "bug", "message": "Logo is blurry"},
                headers=auth_headers(ctx["contact"]),
            )
        ).json()
        await client.patch(
            f"/admin/feedback/{created['id']}", json={"status": "done"}, headers=auth_headers(ctx["admin"])
        )
        notes = await _notifications(db_session, ctx["contact"])
        assert notes[0].title == "Your bug report has been addressed"
        assert notes[0].link == "/portal/feedback"

    async def test_status_bookkeeping(self, client, db_session, ctx) -> None:
        created = (await client.post("/feedback", json=_bug(), headers=auth_headers(ctx["owner"]))).json()
        h = auth_headers(ctx["admin"])
        url = f"/admin/feedback/{created['id']}"

        # "in review" is internal — no notification.
        assert (await client.patch(url, json={"status": "in_review"}, headers=h)).json()["resolved_at"] is None
        assert await _notifications(db_session, ctx["owner"]) == []

        done = (await client.patch(url, json={"status": "done"}, headers=h)).json()
        assert done["resolved_at"] is not None
        reopened = (await client.patch(url, json={"status": "new"}, headers=h)).json()
        assert reopened["resolved_at"] is None

        # A note-only edit leaves the status alone and tells nobody.
        before = len(await _notifications(db_session, ctx["owner"]))
        noted = (await client.patch(url, json={"internal_note": "dup of #12"}, headers=h)).json()
        assert noted["status"] == "new"
        assert len(await _notifications(db_session, ctx["owner"])) == before

    async def test_unknown_feedback_is_404(self, client, ctx) -> None:
        res = await client.get(
            "/admin/feedback/00000000-0000-0000-0000-000000000000", headers=auth_headers(ctx["admin"])
        )
        assert res.status_code == 404

    async def test_summary(self, client, db_session, ctx) -> None:
        await client.post("/feedback", json=_bug(rating=2), headers=auth_headers(ctx["owner"]))
        await client.post(
            "/feedback",
            json={"surface": "portal", "kind": "praise", "message": "Love it", "rating": 5},
            headers=auth_headers(ctx["contact"]),
        )
        await _age(db_session, ctx["owner"], 4)
        await client.post(
            "/feedback/pulse/first-week", json={"surface": "app", "rating": 4}, headers=auth_headers(ctx["owner"])
        )

        summary = (await client.get("/admin/feedback/summary", headers=auth_headers(ctx["admin"]))).json()
        assert summary["by_kind"] == {"bug": 1, "praise": 1, "pulse": 1}
        assert summary["by_surface"] == {"app": 2, "portal": 1}
        assert summary["open_total"] == 2  # the bare pulse score files itself as done
        assert summary["rated_30d"] == 3
        assert summary["avg_rating_30d"] == pytest.approx(3.67, abs=0.01)
        assert summary["pulse_avg_rating"] == 4.0
        assert summary["pulse_answered"] == 1
        assert summary["pulse_dismissed"] == 0


class TestPulse:
    async def test_brand_new_accounts_are_not_asked(self, client, ctx) -> None:
        res = await client.get("/feedback/pulse", headers=auth_headers(ctx["owner"]))
        assert res.json() == {"pulse_key": None}

    async def test_first_week_check_in_answered_once(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["owner"], 4)
        h = auth_headers(ctx["owner"])
        assert (await client.get("/feedback/pulse", headers=h)).json() == {"pulse_key": "first-week"}

        res = await client.post(
            "/feedback/pulse/first-week",
            json={"surface": "app", "agency_id": str(ctx["agency"].id), "rating": 5, "message": "So far so good"},
            headers=h,
        )
        assert res.status_code == 201, res.text
        assert res.json()["kind"] == "pulse"
        assert res.json()["status"] == "new"  # it has a comment, so it's triaged

        assert (await client.get("/feedback/pulse", headers=h)).json() == {"pulse_key": None}
        again = await client.post("/feedback/pulse/first-week", json={"surface": "app", "rating": 1}, headers=h)
        assert again.status_code == 409

    async def test_rating_only_answer_stays_out_of_the_way(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["owner"], 4)
        h = auth_headers(ctx["owner"])
        res = await client.post("/feedback/pulse/first-week", json={"surface": "app", "rating": 4}, headers=h)
        assert res.json()["status"] == "done"
        assert (await client.get("/feedback/mine", headers=h)).json() == []
        assert await _notifications(db_session, ctx["admin"]) == []

    async def test_low_rating_alerts_the_team_even_without_a_comment(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["contact"], 4)
        await client.post(
            "/feedback/pulse/first-week", json={"surface": "portal", "rating": 1}, headers=auth_headers(ctx["contact"])
        )
        alerts = await _notifications(db_session, ctx["admin"])
        assert [a.title for a in alerts] == ["New check-in (1/5) from Dana Client"]

    async def test_dismiss_is_idempotent_and_sticks(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["owner"], 4)
        h = auth_headers(ctx["owner"])
        assert (await client.post("/feedback/pulse/first-week/dismiss", headers=h)).status_code == 204
        assert (await client.post("/feedback/pulse/first-week/dismiss", headers=h)).status_code == 204
        assert (await client.get("/feedback/pulse", headers=h)).json() == {"pulse_key": None}

        # A month in, the next milestone comes round.
        await _age(db_session, ctx["owner"], 31)
        assert (await client.get("/feedback/pulse", headers=h)).json() == {"pulse_key": "first-month"}

    async def test_only_the_latest_milestone_is_offered(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["owner"], 45)
        h = auth_headers(ctx["owner"])
        assert (await client.get("/feedback/pulse", headers=h)).json() == {"pulse_key": "first-month"}

    async def test_unknown_and_future_keys(self, client, db_session, ctx) -> None:
        await _age(db_session, ctx["owner"], 4)
        h = auth_headers(ctx["owner"])
        assert (await client.post("/feedback/pulse/someday/dismiss", headers=h)).status_code == 404
        future = await client.post("/feedback/pulse/first-month", json={"surface": "app", "rating": 3}, headers=h)
        assert future.status_code == 409
