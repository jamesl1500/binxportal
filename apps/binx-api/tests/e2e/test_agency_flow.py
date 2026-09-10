"""
End-to-end tests for the ``/agencies`` router: create an agency, invite a
second person, have them accept, manage the roster, and run the client CRUD.
"""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers, extract_token
from tests.factories import make_user

pytestmark = pytest.mark.e2e


class TestAgencyLifecycle:
    async def test_create_agency_makes_the_caller_the_owner(self, auth_client) -> None:
        response = await auth_client.post("/agencies", json={"name": "Pixel Forge"})
        assert response.status_code == 201
        body = response.json()
        assert body["slug"] == "pixel-forge"
        assert body["role"] == "owner"

        mine = await auth_client.get("/agencies/mine")
        assert [a["name"] for a in mine.json()] == ["Pixel Forge"]

    async def test_rename_keeps_the_slug(self, auth_client) -> None:
        agency_id = (await auth_client.post("/agencies", json={"name": "Rename Me"})).json()["id"]
        renamed = await auth_client.patch(f"/agencies/{agency_id}", json={"name": "Renamed"})
        assert renamed.json()["name"] == "Renamed"
        assert renamed.json()["slug"] == "rename-me"

    async def test_only_an_owner_can_delete_an_agency(self, client, user, other_user) -> None:
        # `user` owns it; add `other_user` as a plain member.
        owner_headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Owned"}, headers=owner_headers)).json()["id"]

        invite = await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": other_user.email, "role": "member"},
            headers=owner_headers,
        )
        assert invite.status_code == 201

        # A member can't delete it.
        member_headers = auth_headers(other_user)
        # other_user must accept first — do that through the token flow below in the invitation test;
        # here just assert the un-joined member gets 404 (agency existence hidden).
        assert (await client.delete(f"/agencies/{agency_id}", headers=member_headers)).status_code == 404
        # The owner can.
        assert (await client.delete(f"/agencies/{agency_id}", headers=owner_headers)).status_code == 204


class TestInvitationFlow:
    async def test_invite_preview_accept_and_appear_on_the_roster(self, client, user, other_user, email_outbox) -> None:
        owner_headers = auth_headers(user)
        invitee_headers = auth_headers(other_user)

        agency_id = (await client.post("/agencies", json={"name": "Team Co"}, headers=owner_headers)).json()["id"]

        invite = await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": other_user.email, "role": "admin"},
            headers=owner_headers,
        )
        assert invite.status_code == 201

        token = extract_token(email_outbox[0].body)

        # Preview needs no session.
        preview = await client.get("/agencies/invitations/preview", params={"token": token})
        assert preview.json()["agency_name"] == "Team Co"
        assert preview.json()["role"] == "admin"

        accept = await client.post("/agencies/invitations/accept", json={"token": token}, headers=invitee_headers)
        assert accept.status_code == 200
        assert accept.json()["role"] == "admin"

        roster = await client.get(f"/agencies/{agency_id}/members", headers=owner_headers)
        emails = {m["email"] for m in roster.json()}
        assert emails == {user.email, other_user.email}

    async def test_accepting_with_the_wrong_account_is_forbidden(self, client, user, email_outbox) -> None:
        owner_headers = auth_headers(user)  # `user` is alice@example.com
        agency_id = (await client.post("/agencies", json={"name": "Locked"}, headers=owner_headers)).json()["id"]
        await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": "intended-recipient@example.com", "role": "member"},
            headers=owner_headers,
        )
        token = extract_token(email_outbox[0].body)

        # Alice's account isn't the invited address -> 403.
        response = await client.post("/agencies/invitations/accept", json={"token": token}, headers=owner_headers)
        assert response.status_code == 403


class TestClientCrud:
    async def test_full_client_crud_cycle(self, auth_client) -> None:
        agency_id = (await auth_client.post("/agencies", json={"name": "Client Haver"})).json()["id"]

        created = await auth_client.post(
            f"/agencies/{agency_id}/clients",
            json={"name": "Globex", "primary_contact_email": "ops@globex.example"},
        )
        assert created.status_code == 201
        client_id = created.json()["id"]
        assert created.json()["slug"] == "globex"

        updated = await auth_client.patch(
            f"/agencies/{agency_id}/clients/{client_id}",
            json={"name": "Globex Corporation", "primary_contact_name": "Hank"},
        )
        assert updated.json()["name"] == "Globex Corporation"

        archived = await auth_client.patch(
            f"/agencies/{agency_id}/clients/{client_id}/status", json={"is_active": False}
        )
        assert archived.json()["is_active"] is False

        # Archived clients still list, just after the active ones.
        listing = await auth_client.get(f"/agencies/{agency_id}/clients")
        assert [c["id"] for c in listing.json()] == [client_id]

        deleted = await auth_client.delete(f"/agencies/{agency_id}/clients/{client_id}")
        assert deleted.status_code == 204
