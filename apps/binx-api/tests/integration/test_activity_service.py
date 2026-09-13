"""
Integration tests for ``binx_api.modules.activity.service`` — the two feeds
(agency-wide + personal security), and the visibility gate that hides
``VISIBILITY_ADMIN`` entries from non-admin members.
"""

from __future__ import annotations

import pytest

from binx_api.modules.activity import service
from binx_api.modules.activity.models import (
    CATEGORY_CLIENTS,
    CATEGORY_TEAM,
    SCOPE_ACCOUNT,
    VISIBILITY_ADMIN,
)
from binx_api.modules.messaging import realtime
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.integration


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def accept(self) -> None:  # pragma: no cover
        pass

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


@pytest.fixture(autouse=True)
def _fresh_manager(monkeypatch):
    monkeypatch.setattr(realtime, "manager", realtime.ConnectionManager())


class TestAgencyFeed:
    async def test_admin_sees_everything_a_member_sees_only_team_visible(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        await service.log_agency_activity(
            db_session,
            agency.id,
            category=CATEGORY_CLIENTS,
            event_type="client_created",
            summary="Added a client",
        )
        await service.log_agency_activity(
            db_session,
            agency.id,
            category=CATEGORY_TEAM,
            event_type="member_role_changed",
            summary="Promoted someone",
            visibility=VISIBILITY_ADMIN,
        )

        admin_rows = await service.list_agency_activity(db_session, agency.id, viewer_is_admin=True)
        member_rows = await service.list_agency_activity(db_session, agency.id, viewer_is_admin=False)
        as_admin = {e.event_type for e in admin_rows}
        as_member = {e.event_type for e in member_rows}

        assert {"client_created", "member_role_changed"} <= as_admin
        assert "client_created" in as_member
        assert "member_role_changed" not in as_member

    async def test_category_filter(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await service.log_agency_activity(
            db_session, agency.id, category=CATEGORY_CLIENTS, event_type="client_created", summary="c"
        )
        await service.log_agency_activity(
            db_session, agency.id, category=CATEGORY_TEAM, event_type="member_joined", summary="j"
        )

        rows = await service.list_agency_activity(
            db_session, agency.id, viewer_is_admin=True, category=CATEGORY_CLIENTS
        )
        assert [e.event_type for e in rows] == ["client_created"]

    async def test_agency_feed_excludes_account_scope_entries(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await service.log_account_activity(db_session, owner, event_type="login", summary="Signed in")

        rows = await service.list_agency_activity(db_session, agency.id, viewer_is_admin=True)
        assert all(e.scope == "agency" for e in rows)
        assert all(e.event_type != "login" for e in rows)


class TestRealtimeBroadcast:
    async def test_team_visibility_reaches_every_member(self, db_session) -> None:
        owner = await make_user(db_session)
        member = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=member)
        sock_owner, sock_member = FakeSocket(), FakeSocket()
        await realtime.manager.connect(owner.id, sock_owner)
        await realtime.manager.connect(member.id, sock_member)

        entry = await service.log_agency_activity(
            db_session, agency.id, category=CATEGORY_CLIENTS, event_type="client_created", summary="Added a client"
        )

        for sock in (sock_owner, sock_member):
            assert len(sock.sent) == 1
            assert sock.sent[0]["type"] == realtime.EVENT_ACTIVITY_CREATED
            assert sock.sent[0]["data"]["id"] == str(entry.id)

    async def test_admin_visibility_skips_plain_members(self, db_session) -> None:
        owner = await make_user(db_session)
        member = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=member)
        sock_owner, sock_member = FakeSocket(), FakeSocket()
        await realtime.manager.connect(owner.id, sock_owner)
        await realtime.manager.connect(member.id, sock_member)

        await service.log_agency_activity(
            db_session,
            agency.id,
            category=CATEGORY_TEAM,
            event_type="member_role_changed",
            summary="Promoted someone",
            visibility=VISIBILITY_ADMIN,
        )

        assert len(sock_owner.sent) == 1
        assert sock_member.sent == []

    async def test_account_activity_broadcasts_only_to_the_subject(self, db_session) -> None:
        alice = await make_user(db_session)
        bob = await make_user(db_session)
        sock_alice, sock_bob = FakeSocket(), FakeSocket()
        await realtime.manager.connect(alice.id, sock_alice)
        await realtime.manager.connect(bob.id, sock_bob)

        await service.log_account_activity(db_session, alice, event_type="login", summary="Signed in")

        assert len(sock_alice.sent) == 1
        assert sock_alice.sent[0]["type"] == realtime.EVENT_ACTIVITY_CREATED
        assert sock_bob.sent == []


class TestAccountFeed:
    async def test_personal_security_history_is_per_user(self, db_session) -> None:
        alice = await make_user(db_session)
        bob = await make_user(db_session)

        await service.log_account_activity(db_session, alice, event_type="login", summary="Signed in")
        await service.log_account_activity(db_session, alice, event_type="password_changed", summary="Password changed")
        await service.log_account_activity(db_session, bob, event_type="login", summary="Signed in")

        alice_rows = await service.list_account_activity(db_session, alice)
        bob_rows = await service.list_account_activity(db_session, bob)

        assert {e.event_type for e in alice_rows} == {"login", "password_changed"}
        assert [e.scope for e in alice_rows] == [SCOPE_ACCOUNT, SCOPE_ACCOUNT]
        assert len(bob_rows) == 1

    async def test_actor_defaults_to_the_subject(self, db_session) -> None:
        user = await make_user(db_session, full_name="Casey Case")
        entry = await service.log_account_activity(db_session, user, event_type="login", summary="Signed in")
        assert entry.actor_name == "Casey Case"
