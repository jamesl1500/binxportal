"""End-to-end tests for the timeline side rail (``GET /agencies/{id}/timeline/highlights``)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import update

from binx_api.modules.activity.models import VISIBILITY_ADMIN, ActivityLog
from binx_api.modules.agencies.models import AgencyMember
from binx_api.modules.timeline.highlights import nearest_anniversary
from tests.conftest import auth_headers
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_meeting,
    make_meeting_settings,
    make_user,
)

pytestmark = pytest.mark.e2e


@pytest.fixture
async def team(db_session, user):
    agency = await make_agency(db_session, owner=user, name="Highlights Agency")
    bob = await make_user(db_session, user_name="bob", email="bob@example.com", full_name="Bob Member")
    await add_agency_member(db_session, agency=agency, user=bob)
    return agency, bob


def _url(agency) -> str:
    return f"/agencies/{agency.id}/timeline/highlights"


async def _highlights(client, agency, who) -> dict:
    response = await client.get(_url(agency), headers=auth_headers(who))
    assert response.status_code == 200, response.text
    return response.json()


async def _set_joined(db_session, agency, who, joined: datetime) -> None:
    await db_session.execute(
        update(AgencyMember)
        .where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == who.id)
        .values(created_at=joined)
    )
    await db_session.commit()


def _activity(agency, event_type: str, summary: str, *, days_ago: float = 0, visibility: str = "team") -> ActivityLog:
    return ActivityLog(
        agency_id=agency.id,
        category="clients",
        event_type=event_type,
        summary=summary,
        visibility=visibility,
        created_at=datetime.now(UTC) - timedelta(days=days_ago),
    )


class TestAccess:
    async def test_outsiders_get_404(self, client, db_session, team) -> None:
        agency, _bob = team
        stranger = await make_user(db_session, email="x@example.com")
        assert (await client.get(_url(agency), headers=auth_headers(stranger))).status_code == 404

    async def test_a_quiet_agency_is_all_empty(self, client, db_session, user, team) -> None:
        agency, bob = team
        # Both joined long ago, on a day that's nowhere near an anniversary.
        long_ago = datetime.now(UTC) - timedelta(days=200)
        await _set_joined(db_session, agency, user, long_ago)
        await _set_joined(db_session, agency, bob, long_ago)
        data = await _highlights(client, agency, bob)
        assert data["upcoming_meetings"] == []
        assert data["celebrations"] == []
        assert data["wins"] == []
        assert data["this_week"] == {"posts": 0, "comments": 0, "reactions": 0, "top_contributors": []}


class TestMeetings:
    async def test_lists_the_next_weeks_scheduled_meetings_soonest_first(self, client, db_session, user, team) -> None:
        agency, bob = team
        await make_meeting_settings(db_session, agency=agency)
        acme = await make_client(db_session, agency=agency, name="Acme Co")
        hour = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
        schedule = ((timedelta(days=2), "Review"), (timedelta(hours=3), "Kickoff"), (timedelta(days=9), "Too far"))
        for starts_in, title in schedule:
            await make_meeting(
                db_session, agency=agency, client=acme, booked_by=user, starts_at=hour + starts_in, title=title
            )

        meetings = (await _highlights(client, agency, bob))["upcoming_meetings"]
        assert [m["title"] for m in meetings] == ["Kickoff", "Review"]
        assert meetings[0]["client_name"] == "Acme Co"


class TestCelebrations:
    async def test_new_teammates_and_anniversaries(self, client, db_session, user, team) -> None:
        agency, bob = team
        today = datetime.now(UTC)
        # Alice joined 3 years ago tomorrow; Bob joined 2 days ago.
        await _set_joined(db_session, agency, user, today.replace(year=today.year - 3) + timedelta(days=1))
        await _set_joined(db_session, agency, bob, today - timedelta(days=2))

        celebrations = (await _highlights(client, agency, bob))["celebrations"]
        by_kind = {c["kind"]: c for c in celebrations}
        assert by_kind["joined"]["person"]["name"] == "Bob Member"
        assert by_kind["joined"]["user_name"] == "bob"
        assert by_kind["joined"]["years"] is None
        assert by_kind["anniversary"]["years"] == 3
        assert by_kind["anniversary"]["user_name"] == user.user_name

    def test_anniversary_window_wraps_the_new_year(self) -> None:
        assert nearest_anniversary(date(2023, 1, 3), date(2026, 12, 30)) == (date(2027, 1, 3), 4)
        assert nearest_anniversary(date(2023, 12, 28), date(2027, 1, 2)) == (date(2026, 12, 28), 3)
        assert nearest_anniversary(date(2024, 2, 29), date(2027, 2, 27)) == (date(2027, 2, 28), 3)
        # Less than a year in isn't an anniversary, and nor is one months away.
        assert nearest_anniversary(date(2026, 11, 25), date(2026, 11, 20)) is None
        assert nearest_anniversary(date(2020, 6, 1), date(2026, 11, 20)) is None


class TestWins:
    async def test_recent_wins_only_and_admin_only_entries_stay_hidden(self, client, db_session, user, team) -> None:
        agency, bob = team
        db_session.add_all(
            [
                _activity(agency, "proposal_signed", "Acme signed the Website proposal", days_ago=1),
                _activity(agency, "client_created", "Added client Globex", days_ago=3),
                _activity(agency, "client_created", "Too old", days_ago=20),
                _activity(agency, "invoice_created", "Not a win", days_ago=1),
                _activity(agency, "payment_recorded", "Admins only", days_ago=0.5, visibility=VISIBILITY_ADMIN),
            ]
        )
        await db_session.commit()

        for_member = [w["summary"] for w in (await _highlights(client, agency, bob))["wins"]]
        assert for_member == ["Acme signed the Website proposal", "Added client Globex"]
        for_owner = [w["summary"] for w in (await _highlights(client, agency, user))["wins"]]
        assert for_owner == ["Admins only", "Acme signed the Website proposal", "Added client Globex"]


class TestWeekStats:
    async def test_counts_this_weeks_activity_and_ranks_contributors(self, client, user, team) -> None:
        agency, bob = team
        base = f"/agencies/{agency.id}/timeline"
        ids = []
        for body in ("One", "Two"):
            response = await client.post(f"{base}/posts", json={"body": body}, headers=auth_headers(bob))
            ids.append(response.json()["id"])
        await client.post(f"{base}/posts", json={"body": "Mine"}, headers=auth_headers(user))
        await client.post(f"{base}/posts/{ids[0]}/comments", json={"body": "Nice"}, headers=auth_headers(user))
        await client.put(f"{base}/posts/{ids[0]}/reactions/like", headers=auth_headers(user))
        await client.put(f"{base}/posts/{ids[1]}/reactions/love", headers=auth_headers(user))

        week = (await _highlights(client, agency, bob))["this_week"]
        assert (week["posts"], week["comments"], week["reactions"]) == (3, 1, 2)
        ranked = [(c["person"]["name"], c["posts"], c["comments"]) for c in week["top_contributors"]]
        assert ranked == [("Bob Member", 2, 0), (user.full_name, 1, 1)]
