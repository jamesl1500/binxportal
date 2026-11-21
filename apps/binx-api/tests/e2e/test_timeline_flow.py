"""End-to-end tests for the team timeline (``/agencies/{id}/timeline``)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from binx_api.modules.activity.models import ActivityLog
from binx_api.modules.notifications.models import Notification
from binx_api.modules.users.models import UserNotificationSettings
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def team(db_session, user):
    """An agency owned by `user` (Alice), with a member (Bob) and an admin (Cara)."""
    agency = await make_agency(db_session, owner=user, name="Timeline Agency")
    bob = await make_user(db_session, user_name="bob", email="bob@example.com", full_name="Bob Member")
    cara = await make_user(db_session, user_name="cara", email="cara@example.com", full_name="Cara Admin")
    await add_agency_member(db_session, agency=agency, user=bob)
    await add_agency_member(db_session, agency=agency, user=cara, role="admin")
    return agency, bob, cara


def _base(agency) -> str:
    return f"/agencies/{agency.id}/timeline"


async def _post(client, agency, who, body: str, **extra) -> dict:
    response = await client.post(f"{_base(agency)}/posts", json={"body": body, **extra}, headers=auth_headers(who))
    assert response.status_code == 201, response.text
    return response.json()


async def _titles(db_session, user) -> list[str]:
    result = await db_session.execute(
        select(Notification.title).where(Notification.user_id == user.id).order_by(Notification.created_at)
    )
    return list(result.scalars().all())


class TestPosting:
    async def test_members_post_and_everyone_sees_the_feed(self, client, user, team) -> None:
        agency, bob, _cara = team
        post = await _post(client, agency, bob, "  Shipped the new homepage!  ")
        assert post["body"] == "Shipped the new homepage!"
        assert post["author"]["name"] == "Bob Member"
        assert (post["can_edit"], post["can_delete"], post["can_pin"]) == (True, True, False)

        feed = (await client.get(_base(agency), headers=auth_headers(user))).json()
        assert [p["body"] for p in feed["posts"]] == ["Shipped the new homepage!"]
        seen_by_owner = feed["posts"][0]
        assert (seen_by_owner["can_edit"], seen_by_owner["can_delete"], seen_by_owner["can_pin"]) == (False, True, True)
        assert feed["can_moderate"] is True

    async def test_blank_posts_are_rejected(self, client, team) -> None:
        agency, bob, _cara = team
        response = await client.post(f"{_base(agency)}/posts", json={"body": "   "}, headers=auth_headers(bob))
        assert response.status_code == 422

    async def test_outsiders_get_404(self, client, db_session, team) -> None:
        agency, _bob, _cara = team
        stranger = await make_user(db_session, email="x@example.com")
        assert (await client.get(_base(agency), headers=auth_headers(stranger))).status_code == 404

    async def test_feed_pages_newest_first(self, client, team) -> None:
        agency, bob, _cara = team
        for n in range(5):
            await _post(client, agency, bob, f"Post {n}")
        first = (await client.get(f"{_base(agency)}?limit=3", headers=auth_headers(bob))).json()
        assert [p["body"] for p in first["posts"]] == ["Post 4", "Post 3", "Post 2"]
        second = (
            await client.get(f"{_base(agency)}?limit=3&cursor={first['next_cursor']}", headers=auth_headers(bob))
        ).json()
        assert [p["body"] for p in second["posts"]] == ["Post 1", "Post 0"]
        assert second["next_cursor"] is None


class TestEditAndDelete:
    async def test_only_the_author_edits(self, client, user, team) -> None:
        agency, bob, _cara = team
        post = await _post(client, agency, bob, "Draft")
        url = f"{_base(agency)}/posts/{post['id']}"
        assert (await client.patch(url, json={"body": "Hacked"}, headers=auth_headers(user))).status_code == 403
        edited = await client.patch(url, json={"body": "Final"}, headers=auth_headers(bob))
        assert edited.json()["body"] == "Final"
        assert edited.json()["edited_at"] is not None

    async def test_members_cant_delete_others_but_admins_can_and_it_is_logged(
        self, client, db_session, user, team
    ) -> None:
        agency, bob, cara = team
        post = await _post(client, agency, user, "Owner's post")
        url = f"{_base(agency)}/posts/{post['id']}"
        assert (await client.delete(url, headers=auth_headers(bob))).status_code == 403
        assert (await client.delete(url, headers=auth_headers(cara))).status_code == 204
        logged = (
            await db_session.execute(select(ActivityLog).where(ActivityLog.event_type == "timeline_post_removed"))
        ).scalar_one()
        assert logged.visibility == "admin"
        assert "Alice Anderson" in logged.summary

    async def test_comments_follow_the_same_rules(self, client, user, team) -> None:
        agency, bob, cara = team
        post = await _post(client, agency, user, "Hello")
        comment = (
            await client.post(
                f"{_base(agency)}/posts/{post['id']}/comments", json={"body": "Hi!"}, headers=auth_headers(bob)
            )
        ).json()
        url = f"{_base(agency)}/comments/{comment['id']}"
        assert (await client.patch(url, json={"body": "x"}, headers=auth_headers(cara))).status_code == 403
        assert (await client.patch(url, json={"body": "Hi all!"}, headers=auth_headers(bob))).json()[
            "body"
        ] == "Hi all!"
        assert (await client.delete(url, headers=auth_headers(cara))).status_code == 204
        comments = await client.get(f"{_base(agency)}/posts/{post['id']}/comments", headers=auth_headers(bob))
        assert comments.json() == []


class TestModeration:
    async def test_admins_pin_and_pinned_posts_lead_the_first_page_only(self, client, user, team) -> None:
        agency, bob, _cara = team
        older = await _post(client, agency, bob, "Important")
        await _post(client, agency, bob, "Chatter")
        url = f"{_base(agency)}/posts/{older['id']}/pin"
        assert (await client.put(url, json={"pinned": True}, headers=auth_headers(bob))).status_code == 403
        assert (await client.put(url, json={"pinned": True}, headers=auth_headers(user))).json()["pinned"] is True

        feed = (await client.get(_base(agency), headers=auth_headers(bob))).json()
        assert [p["body"] for p in feed["pinned"]] == ["Important"]
        assert [p["body"] for p in feed["posts"]] == ["Chatter"]  # not shown twice

    async def test_only_admins_announce_and_announcements_notify_everyone(self, client, db_session, user, team) -> None:
        agency, bob, cara = team
        denied = await client.post(
            f"{_base(agency)}/posts", json={"body": "All hands", "is_announcement": True}, headers=auth_headers(bob)
        )
        assert denied.status_code == 403

        await _post(client, agency, user, "Office closed Friday", is_announcement=True)
        assert await _titles(db_session, bob) == ["Announcement from Alice Anderson"]
        assert await _titles(db_session, cara) == ["Announcement from Alice Anderson"]
        assert await _titles(db_session, user) == []  # never notified about your own post


class TestReactions:
    async def test_react_unreact_and_notify_the_author_once(self, client, db_session, user, team) -> None:
        agency, bob, _cara = team
        post = await _post(client, agency, user, "Big win")
        url = f"{_base(agency)}/posts/{post['id']}/reactions"

        liked = (await client.put(f"{url}/like", headers=auth_headers(bob))).json()
        assert liked["reactions"] == [{"reaction": "like", "count": 1, "reacted": True, "names": ["Bob Member"]}]
        await client.put(f"{url}/like", headers=auth_headers(bob))  # idempotent
        await client.put(f"{url}/celebrate", headers=auth_headers(bob))
        await client.delete(f"{url}/like", headers=auth_headers(bob))

        final = (await client.get(f"{_base(agency)}/posts/{post['id']}", headers=auth_headers(user))).json()
        assert [(r["reaction"], r["count"], r["reacted"]) for r in final["reactions"]] == [("celebrate", 1, False)]
        # One notification for Bob's first reaction, not one per toggle.
        assert await _titles(db_session, user) == ["Bob Member reacted to your post"]

    async def test_unknown_reactions_are_rejected(self, client, user, team) -> None:
        agency, _bob, _cara = team
        post = await _post(client, agency, user, "Hi")
        response = await client.put(f"{_base(agency)}/posts/{post['id']}/reactions/poop", headers=auth_headers(user))
        assert response.status_code == 422


class TestNotifications:
    async def test_comments_and_mentions(self, client, db_session, user, team) -> None:
        agency, bob, cara = team
        post = await _post(client, agency, user, "Plan for Q1 — thoughts @cara?")
        assert await _titles(db_session, cara) == ["Alice Anderson mentioned you"]

        await client.post(
            f"{_base(agency)}/posts/{post['id']}/comments", json={"body": "Looks good"}, headers=auth_headers(bob)
        )
        assert await _titles(db_session, user) == ["Bob Member commented on your post"]

        # Mentioning the post's author in a comment sends just the mention.
        await client.post(
            f"{_base(agency)}/posts/{post['id']}/comments",
            json={"body": "@alice see above"},
            headers=auth_headers(cara),
        )
        assert (await _titles(db_session, user))[-1] == "Cara Admin mentioned you"
        assert len(await _titles(db_session, user)) == 2

    async def test_editing_only_notifies_newly_mentioned_people(self, client, db_session, user, team) -> None:
        agency, bob, cara = team
        post = await _post(client, agency, user, "cc @bob")
        await client.patch(
            f"{_base(agency)}/posts/{post['id']}", json={"body": "cc @bob @cara"}, headers=auth_headers(user)
        )
        assert await _titles(db_session, bob) == ["Alice Anderson mentioned you"]  # not twice
        assert await _titles(db_session, cara) == ["Alice Anderson mentioned you"]

    async def test_the_timeline_toggle_mutes_comment_and_reaction_notifications(
        self, client, db_session, user, team
    ) -> None:
        agency, bob, _cara = team
        db_session.add(UserNotificationSettings(user_id=user.id, inapp_timeline=False))
        await db_session.commit()
        post = await _post(client, agency, user, "Muted")
        await client.put(f"{_base(agency)}/posts/{post['id']}/reactions/like", headers=auth_headers(bob))
        await client.post(
            f"{_base(agency)}/posts/{post['id']}/comments", json={"body": "hi"}, headers=auth_headers(bob)
        )
        assert await _titles(db_session, user) == []


class TestRecentComments:
    async def test_posts_carry_their_latest_three_comments_and_a_count(self, client, user, team) -> None:
        agency, bob, _cara = team
        post = await _post(client, agency, user, "Thread")
        for n in range(5):
            await client.post(
                f"{_base(agency)}/posts/{post['id']}/comments", json={"body": f"c{n}"}, headers=auth_headers(bob)
            )
        read = (await client.get(_base(agency), headers=auth_headers(user))).json()["posts"][0]
        assert read["comment_count"] == 5
        assert [c["body"] for c in read["recent_comments"]] == ["c2", "c3", "c4"]
