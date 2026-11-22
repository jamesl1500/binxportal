"""End-to-end tests for the admin error dashboard (/admin/errors/*) and
binx-web's error ingest (POST /errors/report)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from binx_api.core.errors import new_reference
from binx_api.modules.errors import store
from binx_api.modules.errors.models import ErrorEvent, ErrorIssue
from binx_api.modules.errors.store import _maybe_prune as real_maybe_prune
from tests.conftest import auth_headers
from tests.factories import make_user

pytestmark = pytest.mark.e2e


async def _seed(
    *,
    at: datetime,
    fingerprint: str = "fp-a",
    title: str = "KeyError: 'plan'",
    source: str = "api",
    user_id: uuid.UUID | None = None,
    request_id: str | None = None,
) -> uuid.UUID:
    event_id = uuid.uuid4()
    assert await store.write(
        store.Occurrence(
            event_id=event_id,
            reference=new_reference(event_id),
            fingerprint=fingerprint,
            source=source,
            level="error",
            error_type="KeyError",
            message=title,
            title=title,
            culprit="binx_api.modules.billing.service in change_plan",
            request_id=request_id,
            user_id=user_id,
            stacktrace="Traceback...\nKeyError: 'plan'",
        ),
        now=at,
    )
    return event_id


@pytest.fixture
async def admin(db_session):
    return await make_user(db_session, full_name="Binx Admin", role="admin")


@pytest.fixture
def now() -> datetime:
    return datetime.now(UTC)


class TestPermissions:
    @pytest.mark.parametrize(
        "path", ["/admin/errors/summary", "/admin/errors/issues", "/admin/errors/badge", "/admin/errors/lookup?ref=x"]
    )
    async def test_platform_admins_only(self, client, user, path) -> None:
        assert (await client.get(path)).status_code == 401
        assert (await client.get(path, headers=auth_headers(user))).status_code == 403


class TestSummary:
    async def test_counts_for_each_window(self, client, admin, db_session, now) -> None:
        alice, bob = uuid.uuid4(), uuid.uuid4()
        await _seed(at=now - timedelta(minutes=10), user_id=alice)
        await _seed(at=now - timedelta(minutes=40), user_id=bob, fingerprint="fp-b", source="web")
        await _seed(at=now - timedelta(hours=5), user_id=alice)
        await _seed(at=now - timedelta(hours=20))
        await _seed(at=now - timedelta(hours=30))  # the 24 hours before
        await _seed(at=now - timedelta(days=3))  # outside everything

        res = await client.get("/admin/errors/summary", headers=auth_headers(admin))
        assert res.status_code == 200, res.text
        data = res.json()

        assert data["windows"]["1h"] == {"events": 2, "issues": 2, "users": 2}
        assert data["windows"]["12h"] == {"events": 3, "issues": 2, "users": 2}
        assert data["windows"]["24h"] == {"events": 4, "issues": 2, "users": 2}
        assert data["previous_24h"] == 1
        assert data["by_source_24h"] == {"api": 3, "web": 1}
        assert data["open_issues_24h"] == 2

    async def test_hourly_chart_is_24_zero_filled_buckets(self, client, admin, now) -> None:
        await _seed(at=now)
        await _seed(at=now)
        await _seed(at=now - timedelta(hours=3), source="web", fingerprint="fp-web")

        hourly = (await client.get("/admin/errors/summary", headers=auth_headers(admin))).json()["hourly"]
        assert len(hourly) == 24
        assert hourly[-1]["api"] == 2 and hourly[-1]["total"] == 2
        assert hourly[-4]["web"] == 1
        assert sum(h["total"] for h in hourly) == 3
        starts = [datetime.fromisoformat(h["hour_start"]) for h in hourly]
        assert all(b - a == timedelta(hours=1) for a, b in zip(starts, starts[1:], strict=False))

    async def test_empty(self, client, admin) -> None:
        data = (await client.get("/admin/errors/summary", headers=auth_headers(admin))).json()
        assert data["windows"]["24h"] == {"events": 0, "issues": 0, "users": 0}
        assert len(data["hourly"]) == 24


class TestIssues:
    async def test_list_sorts_by_frequency_in_the_period(self, client, admin, now) -> None:
        for minutes in (5, 6, 7):
            await _seed(at=now - timedelta(minutes=minutes), fingerprint="fp-often", title="often")
        await _seed(at=now - timedelta(minutes=1), fingerprint="fp-once", title="once")
        await _seed(at=now - timedelta(days=2), fingerprint="fp-old", title="old")

        res = await client.get("/admin/errors/issues?period=24h", headers=auth_headers(admin))
        data = res.json()
        assert data["total"] == 2  # "old" wasn't seen in the period
        assert [i["title"] for i in data["items"]] == ["often", "once"]
        assert data["items"][0]["events_in_period"] == 3

        recent = (await client.get("/admin/errors/issues?sort=recent", headers=auth_headers(admin))).json()
        assert [i["title"] for i in recent["items"]] == ["once", "often"]

        week = (await client.get("/admin/errors/issues?period=7d", headers=auth_headers(admin))).json()
        assert week["total"] == 3

    async def test_filters_and_search(self, client, admin, now) -> None:
        await _seed(at=now, fingerprint="fp-1", title="Stripe timeout", source="api")
        await _seed(at=now, fingerprint="fp-2", title="ChunkLoadError 100%", source="web")
        headers = auth_headers(admin)

        web = (await client.get("/admin/errors/issues?source=web", headers=headers)).json()
        assert [i["title"] for i in web["items"]] == ["ChunkLoadError 100%"]
        found = (await client.get("/admin/errors/issues?q=stripe", headers=headers)).json()
        assert [i["title"] for i in found["items"]] == ["Stripe timeout"]
        # A literal % is searched for, not treated as a wildcard.
        pct = (await client.get("/admin/errors/issues?q=100%25", headers=headers)).json()
        assert [i["title"] for i in pct["items"]] == ["ChunkLoadError 100%"]

    async def test_detail_shows_recent_occurrences_and_one_in_full(self, client, admin, db_session, now) -> None:
        first = await _seed(at=now - timedelta(hours=2), user_id=admin.id)
        latest = await _seed(at=now)
        issue_id = (await db_session.get(ErrorEvent, first)).issue_id

        res = await client.get(f"/admin/errors/issues/{issue_id}", headers=auth_headers(admin))
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["issue"]["event_count"] == 2
        assert data["issue"]["events_in_period"] == 2
        assert [e["id"] for e in data["recent_events"]] == [str(latest), str(first)]
        assert data["recent_events"][1]["user_name"] == "Binx Admin"
        assert data["event"]["id"] == str(latest)
        assert "KeyError" in data["event"]["stacktrace"]
        assert "stacktrace" not in data["recent_events"][0]
        assert len(data["hourly"]) == 24

        picked = (
            await client.get(f"/admin/errors/issues/{issue_id}?event_id={first}", headers=auth_headers(admin))
        ).json()
        assert picked["event"]["id"] == str(first)

        other = await _seed(at=now, fingerprint="fp-other")
        res = await client.get(f"/admin/errors/issues/{issue_id}?event_id={other}", headers=auth_headers(admin))
        assert res.status_code == 404

    async def test_resolve_ignore_reopen(self, client, admin, db_session, now) -> None:
        event_id = await _seed(at=now)
        issue_id = (await db_session.get(ErrorEvent, event_id)).issue_id
        headers = auth_headers(admin)

        res = await client.patch(f"/admin/errors/issues/{issue_id}", json={"status": "resolved"}, headers=headers)
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "resolved"
        assert res.json()["status_changed_by_name"] == "Binx Admin"
        assert res.json()["resolved_at"]

        # Resolved issues drop off the badge.
        assert (await client.get("/admin/errors/badge", headers=headers)).json() == {"open_issues_24h": 0}

        bad = await client.patch(f"/admin/errors/issues/{issue_id}", json={"status": "gone"}, headers=headers)
        assert bad.status_code == 422

        res = await client.patch(f"/admin/errors/issues/{issue_id}", json={"status": "unresolved"}, headers=headers)
        assert res.json()["status"] == "unresolved"
        assert (await client.get("/admin/errors/badge", headers=headers)).json() == {"open_issues_24h": 1}

    async def test_lookup_by_reference_or_request_id(self, client, admin, db_session, now) -> None:
        event_id = await _seed(at=now, request_id="req-support-123")
        event = await db_session.get(ErrorEvent, event_id)
        headers = auth_headers(admin)

        for ref in (event.reference, event.reference.lower(), "req-support-123"):
            res = await client.get(f"/admin/errors/lookup?ref={ref}", headers=headers)
            assert res.status_code == 200, ref
            assert res.json() == {"issue_id": str(event.issue_id), "event_id": str(event_id)}

        assert (await client.get("/admin/errors/lookup?ref=NOPE1234", headers=headers)).status_code == 404


class TestWebIngest:
    async def test_anonymous_browser_report(self, client, db_session) -> None:
        res = await client.post(
            "/errors/report",
            json={
                "runtime": "browser",
                "error_type": "TypeError",
                "message": "Cannot read properties of undefined (reading 'id')",
                "stack": "TypeError: ...\n    at f (chunk-abc.js:1:2)",
                "path": "/projects/123",
                "user_agent": "Mozilla/5.0",
            },
        )
        assert res.status_code == 202, res.text
        reference = res.json()["reference"]
        assert len(reference) == 8

        event = (await db_session.execute(select(ErrorEvent).where(ErrorEvent.reference == reference))).scalar_one()
        assert event.source == "web"
        assert event.user_id is None
        assert event.context["runtime"] == "browser"
        assert event.context["user_agent"] == "Mozilla/5.0"

    async def test_a_signed_in_report_names_the_user(self, client, user, db_session) -> None:
        res = await client.post(
            "/errors/report",
            json={"runtime": "server", "error_type": "Error", "message": "render failed", "route": "/dashboard"},
            headers=auth_headers(user),
        )
        assert res.status_code == 202
        event = (await db_session.execute(select(ErrorEvent))).scalar_one()
        assert event.user_id == user.id
        issue = await db_session.get(ErrorIssue, event.issue_id)
        assert issue.culprit == "/dashboard (server)"

    async def test_a_bad_token_is_ignored_not_rejected(self, client, db_session) -> None:
        res = await client.post(
            "/errors/report",
            json={"runtime": "browser", "message": "oops"},
            headers={"Authorization": "Bearer not-a-jwt"},
        )
        assert res.status_code == 202

    async def test_messages_that_differ_only_in_ids_group_together(self, client, db_session) -> None:
        for project in (uuid.uuid4(), uuid.uuid4()):
            await client.post(
                "/errors/report",
                json={
                    "runtime": "browser",
                    "error_type": "Error",
                    "message": f"Project {project} failed after 3 tries",
                },
            )
        issues = (await db_session.execute(select(ErrorIssue))).scalars().all()
        assert len(issues) == 1
        assert issues[0].event_count == 2

    async def test_oversized_and_malformed_reports_are_rejected(self, client) -> None:
        assert (
            await client.post("/errors/report", json={"runtime": "browser", "message": "x" * 2001})
        ).status_code == 422
        assert (await client.post("/errors/report", json={"runtime": "toaster", "message": "x"})).status_code == 422


class TestRetention:
    async def test_prune_drops_old_occurrences_in_batches_and_keeps_the_issue(
        self, db_session, now, monkeypatch
    ) -> None:
        monkeypatch.setattr(store, "PRUNE_BATCH", 2)
        for days_ago in (40, 35, 31, 31, 31):
            await _seed(at=now - timedelta(days=days_ago))
        recent = await _seed(at=now - timedelta(days=1))

        deleted = await store.prune(now - timedelta(days=30))

        assert deleted == 5  # three batches of at most two
        left = (await db_session.execute(select(ErrorEvent.id))).scalars().all()
        assert left == [recent]
        issue = (await db_session.execute(select(ErrorIssue))).scalar_one()
        assert issue.event_count == 6  # the lifetime count stays

    async def test_writes_dont_wait_for_a_prune(self, db_session, now, monkeypatch) -> None:
        started: list[datetime] = []

        async def fake_prune(cutoff: datetime) -> int:
            started.append(cutoff)
            return 0

        # conftest stubs the scheduler out; put the real one back.
        monkeypatch.setattr(store, "_maybe_prune", real_maybe_prune)
        monkeypatch.setattr(store, "prune", fake_prune)
        monkeypatch.setattr(store, "_last_pruned", None)
        await _seed(at=now)
        await _seed(at=now)  # within the hour: not started again
        for task in list(store._pruning):
            await task
        assert len(started) == 1
