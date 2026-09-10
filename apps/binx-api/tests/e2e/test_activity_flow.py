"""
End-to-end tests for the activity log: a representative producer from each
area writes an entry, the agency feed hides admin-only entries from plain
members, and personal security events land in ``/activity/me`` (never the
agency feed).
"""

from __future__ import annotations

import pytest

from binx_api.modules.projects import service as projects_service
from tests.conftest import DEFAULT_PASSWORD, auth_headers, extract_token
from tests.factories import add_agency_member, make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(projects_service.settings, "project_upload_dir", str(tmp_path))


class TestAgencyFeed:
    async def test_creating_an_agency_and_a_client_shows_in_the_feed(self, client, user) -> None:
        headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Trace Co"}, headers=headers)).json()["id"]
        await client.post(f"/agencies/{agency_id}/clients", json={"name": "Globex"}, headers=headers)

        feed = (await client.get(f"/agencies/{agency_id}/activity", headers=headers)).json()
        events = {e["event_type"] for e in feed["items"]}
        assert {"agency_created", "client_created"} <= events
        client_entry = next(e for e in feed["items"] if e["event_type"] == "client_created")
        assert client_entry["target_name"] == "Globex"
        assert user.full_name in client_entry["summary"]

    async def test_role_changes_are_hidden_from_plain_members(self, client, user, other_user, email_outbox) -> None:
        owner_headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Split Co"}, headers=owner_headers)).json()["id"]
        await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": other_user.email, "role": "member"},
            headers=owner_headers,
        )
        token = extract_token(email_outbox[-1].body)
        await client.post("/agencies/invitations/accept", json={"token": token}, headers=auth_headers(other_user))

        roster = (await client.get(f"/agencies/{agency_id}/members", headers=owner_headers)).json()
        member_id = next(m["id"] for m in roster if m["email"] == other_user.email)
        await client.patch(
            f"/agencies/{agency_id}/members/{member_id}",
            json={"role": "admin"},
            headers=owner_headers,
        )
        # demote again so `other_user` is back to a plain member for the visibility check
        await client.patch(
            f"/agencies/{agency_id}/members/{member_id}",
            json={"role": "member"},
            headers=owner_headers,
        )

        as_owner = (await client.get(f"/agencies/{agency_id}/activity", headers=owner_headers)).json()
        as_member = (await client.get(f"/agencies/{agency_id}/activity", headers=auth_headers(other_user))).json()

        assert any(e["event_type"] == "member_role_changed" for e in as_owner["items"])
        assert any(e["event_type"] == "member_joined" for e in as_member["items"])
        assert all(e["event_type"] != "member_role_changed" for e in as_member["items"])

    async def test_category_filter_param(self, client, user) -> None:
        headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Filter Co"}, headers=headers)).json()["id"]
        await client.post(f"/agencies/{agency_id}/clients", json={"name": "Acme"}, headers=headers)

        clients_only = (await client.get(f"/agencies/{agency_id}/activity?category=clients", headers=headers)).json()
        assert clients_only["items"]
        assert all(e["category"] == "clients" for e in clients_only["items"])


class TestAccountFeed:
    async def test_sign_in_lands_in_the_personal_feed_only(self, client, db_session) -> None:
        account = await make_user(db_session, email="feed-user@example.com", password=DEFAULT_PASSWORD)
        agency = await make_agency(db_session, owner=account)

        login = await client.post("/auth/login", json={"email": account.email, "password": DEFAULT_PASSWORD})
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        me = (await client.get("/activity/me", headers=headers)).json()
        assert any(e["event_type"] == "login" for e in me["items"])

        agency_feed = (await client.get(f"/agencies/{agency.id}/activity", headers=headers)).json()
        assert all(e["event_type"] != "login" for e in agency_feed["items"])

    async def test_password_change_is_recorded(self, client, user) -> None:
        headers = auth_headers(user)
        resp = await client.patch(
            "/users/me/password",
            json={"current_password": DEFAULT_PASSWORD, "new_password": "brand-new-pw-123"},
            headers=headers,
        )
        assert resp.status_code == 200

        me = (await client.get("/activity/me", headers=headers)).json()
        assert any(e["event_type"] == "password_changed" for e in me["items"])
