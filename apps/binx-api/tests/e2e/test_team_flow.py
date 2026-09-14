"""
End-to-end tests for the team page's server surface: the owner/admin edit of a
member's agency title + internal notes, the privacy gating a plain member sees,
and the invitation resend / history endpoints.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies.models import Agency
from binx_api.modules.users import service as users_service
from binx_api.modules.users.models import UserPrivacySettings
from tests.conftest import auth_headers, extract_token
from tests.factories import add_agency_member, make_user

pytestmark = pytest.mark.e2e

PNG = ("avatar.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(users_service.settings, "agency_upload_dir", str(tmp_path))


async def _agency_with_member(client, owner, invitee, email_outbox, *, role="member"):
    owner_headers = auth_headers(owner)
    agency_id = (await client.post("/agencies", json={"name": "Team Co"}, headers=owner_headers)).json()["id"]
    await client.post(
        f"/agencies/{agency_id}/invitations",
        json={"email": invitee.email, "role": role},
        headers=owner_headers,
    )
    token = extract_token(email_outbox[-1].body)
    await client.post("/agencies/invitations/accept", json={"token": token}, headers=auth_headers(invitee))
    return agency_id


class TestMemberDetails:
    async def test_admin_sets_title_and_notes_and_a_member_never_sees_the_notes(
        self, client, user, other_user, email_outbox
    ) -> None:
        owner_headers = auth_headers(user)
        agency_id = await _agency_with_member(client, user, other_user, email_outbox)

        roster = (await client.get(f"/agencies/{agency_id}/members", headers=owner_headers)).json()
        member_id = next(m["id"] for m in roster if m["email"] == other_user.email)

        updated = await client.patch(
            f"/agencies/{agency_id}/members/{member_id}/details",
            json={"title": "Lead Designer", "admin_notes": "great with clients"},
            headers=owner_headers,
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Lead Designer"
        assert updated.json()["admin_notes"] == "great with clients"

        # Persists, and the owner/admin keeps seeing the notes.
        as_owner = (await client.get(f"/agencies/{agency_id}/members", headers=owner_headers)).json()
        theirs = next(m for m in as_owner if m["id"] == member_id)
        assert theirs["title"] == "Lead Designer"
        assert theirs["admin_notes"] == "great with clients"

        # The plain member never gets admin_notes for anyone.
        as_member = (await client.get(f"/agencies/{agency_id}/members", headers=auth_headers(other_user))).json()
        assert all(m["admin_notes"] is None for m in as_member)


class TestSingleMemberAndAvatar:
    async def test_read_one_member_and_view_their_avatar(self, client, user, other_user, email_outbox) -> None:
        owner_headers = auth_headers(user)
        agency_id = await _agency_with_member(client, user, other_user, email_outbox)

        roster = (await client.get(f"/agencies/{agency_id}/members", headers=owner_headers)).json()
        member_id = next(m["id"] for m in roster if m["email"] == other_user.email)

        single = await client.get(f"/agencies/{agency_id}/members/{member_id}", headers=owner_headers)
        assert single.status_code == 200
        assert single.json()["id"] == member_id
        assert single.json()["has_avatar"] is False

        # No avatar yet — the proxy 404s for a teammate too.
        no_avatar = await client.get(f"/agencies/{agency_id}/members/{member_id}/avatar", headers=owner_headers)
        assert no_avatar.status_code == 404

        # other_user uploads their own avatar through /users/me/avatar...
        await client.put("/users/me/avatar", files={"file": PNG}, headers=auth_headers(other_user))

        # ...and it now shows up both on the member list and the agency-scoped proxy.
        refreshed = await client.get(f"/agencies/{agency_id}/members/{member_id}", headers=owner_headers)
        assert refreshed.json()["has_avatar"] is True
        avatar = await client.get(f"/agencies/{agency_id}/members/{member_id}/avatar", headers=owner_headers)
        assert avatar.status_code == 200
        assert avatar.headers["content-type"] == "image/png"


class TestPrivacyGating:
    async def test_a_plain_member_does_not_see_a_private_teammates_phone(
        self, client, db_session, user, other_user, email_outbox
    ) -> None:
        agency_id = await _agency_with_member(client, user, other_user, email_outbox)

        # A third person joins as a plain member and marks their profile private.
        private_user = await make_user(db_session, full_name="Pat Private")
        private_user.phone_number = "+1-555-0100"
        db_session.add(private_user)
        await db_session.commit()

        agency = await db_session.get(Agency, agency_id)
        await add_agency_member(db_session, agency=agency, user=private_user)
        db_session.add(
            UserPrivacySettings(user_id=private_user.id, profile_visibility="private", show_phone_to_team=True)
        )
        await db_session.commit()
        await users_service.update_qualifications(
            db_session, private_user, skills=["Secret skill"], experience=[], education=[]
        )

        as_member = (await client.get(f"/agencies/{agency_id}/members", headers=auth_headers(other_user))).json()
        private_row = next(m for m in as_member if m["user_id"] == str(private_user.id))
        assert private_row["phone"] is None
        assert private_row["bio"] is None
        assert private_row["skills"] == []

        # The owner administers the roster — still sees the email.
        as_owner = (await client.get(f"/agencies/{agency_id}/members", headers=auth_headers(user))).json()
        owner_view = next(m for m in as_owner if m["user_id"] == str(private_user.id))
        assert owner_view["email"] == private_user.email


class TestInvitationResendAndHistory:
    async def test_resend_returns_an_accept_url_and_history_shows_revoked(self, client, user, email_outbox) -> None:
        owner_headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Invy"}, headers=owner_headers)).json()["id"]

        created = await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": "invitee@example.com", "role": "member"},
            headers=owner_headers,
        )
        assert created.json()["accept_url"]
        invitation_id = created.json()["id"]

        resent = await client.post(f"/agencies/{agency_id}/invitations/{invitation_id}/resend", headers=owner_headers)
        assert resent.status_code == 200
        assert "/auth/accept-invite?token=" in resent.json()["accept_url"]

        await client.delete(f"/agencies/{agency_id}/invitations/{invitation_id}", headers=owner_headers)

        pending = (await client.get(f"/agencies/{agency_id}/invitations", headers=owner_headers)).json()
        assert pending == []
        history = (await client.get(f"/agencies/{agency_id}/invitations?status=all", headers=owner_headers)).json()
        assert [i["id"] for i in history] == [invitation_id]
        assert history[0]["status"] == "revoked"
