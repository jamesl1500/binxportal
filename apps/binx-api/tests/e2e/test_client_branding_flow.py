"""
End-to-end tests for per-client portal branding: the staff-side
branding/logo CRUD under /agencies/{id}/clients/{id}/branding, and how it
surfaces on the client-portal side (/portal/context, /portal/logo) —
including the fallback to the agency's own AgencyProfile branding when a
client hasn't set its own. Mirrors test_agency_profile_flow.py's shape for
the staff side.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies import service
from binx_api.modules.agencies.models import ROLE_MEMBER, AgencyMember
from tests.conftest import auth_headers, extract_token
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.e2e

PNG = ("logo.png", b"\x89PNG\r\n\x1a\nfake", "image/png")
OTHER_PNG = ("other.png", b"\x89PNG\r\n\x1a\nother", "image/png")


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "agency_upload_dir", str(tmp_path))


@pytest.fixture
async def team(db_session):
    owner = await make_user(db_session, full_name="Olive Owner")
    member = await make_user(db_session, full_name="Mona Member")
    agency = await make_agency(db_session, owner=owner)
    db_session.add(AgencyMember(agency_id=agency.id, user_id=member.id, role=ROLE_MEMBER))
    await db_session.commit()
    agency_client = await make_client(db_session, agency=agency, name="Northwind Traders")
    return agency, owner, member, agency_client


async def _invite_and_accept(client, db_session, email_outbox, agency_id, client_id, owner, contact_email):
    invite = await client.post(
        f"/agencies/{agency_id}/clients/{client_id}/contacts/invitations",
        json={"email": contact_email},
        headers=auth_headers(owner),
    )
    assert invite.status_code == 201, invite.text
    token = extract_token(email_outbox[-1].body)

    contact_user = await make_user(db_session, full_name="Casey Client", email=contact_email)
    accept = await client.post("/portal/invitations/accept", json={"token": token}, headers=auth_headers(contact_user))
    assert accept.status_code == 200, accept.text
    return contact_user


class TestBranding:
    async def test_member_reads_owner_writes(self, client, team) -> None:
        agency, owner, member, agency_client = team
        base = f"/agencies/{agency.id}/clients/{agency_client.id}/branding"

        read = await client.get(base, headers=auth_headers(member))
        assert read.status_code == 200
        assert read.json()["primary_color"] is None
        assert read.json()["has_logo"] is False

        member_patch = await client.patch(base, json={"primary_color": "#112233"}, headers=auth_headers(member))
        assert member_patch.status_code == 403

        updated = await client.patch(
            base,
            json={"primary_color": "#112233", "accent_color": "#445566", "welcome_message": "Welcome aboard!"},
            headers=auth_headers(owner),
        )
        assert updated.status_code == 200
        assert updated.json()["primary_color"] == "#112233"
        assert updated.json()["accent_color"] == "#445566"
        assert updated.json()["welcome_message"] == "Welcome aboard!"

    async def test_bad_color_is_rejected(self, client, team) -> None:
        agency, owner, _member, agency_client = team
        response = await client.patch(
            f"/agencies/{agency.id}/clients/{agency_client.id}/branding",
            json={"primary_color": "blue"},
            headers=auth_headers(owner),
        )
        assert response.status_code == 422


class TestLogo:
    async def test_upload_download_and_clear_the_logo(self, client, team) -> None:
        agency, owner, member, agency_client = team
        base = f"/agencies/{agency.id}/clients/{agency_client.id}/branding"

        uploaded = await client.put(f"{base}/logo", files={"file": PNG}, headers=auth_headers(owner))
        assert uploaded.status_code == 200
        assert uploaded.json()["has_logo"] is True
        assert uploaded.json()["logo_version"]

        got = await client.get(f"{base}/logo", headers=auth_headers(member))
        assert got.status_code == 200
        assert got.content == PNG[1]

        assert (await client.put(f"{base}/logo", files={"file": PNG}, headers=auth_headers(member))).status_code == 403

        cleared = await client.delete(f"{base}/logo", headers=auth_headers(owner))
        assert cleared.json()["has_logo"] is False
        assert (await client.get(f"{base}/logo", headers=auth_headers(member))).status_code == 404

    async def test_a_non_image_is_rejected(self, client, team) -> None:
        agency, owner, _member, agency_client = team
        response = await client.put(
            f"/agencies/{agency.id}/clients/{agency_client.id}/branding/logo",
            files={"file": ("notes.txt", b"hello", "text/plain")},
            headers=auth_headers(owner),
        )
        assert response.status_code == 415


class TestPortalExposure:
    async def test_context_carries_the_clients_own_branding(self, client, db_session, email_outbox, team) -> None:
        agency, owner, _member, agency_client = team
        await client.patch(
            f"/agencies/{agency.id}/clients/{agency_client.id}/branding",
            json={"primary_color": "#112233", "welcome_message": "Welcome aboard!"},
            headers=auth_headers(owner),
        )
        contact = await _invite_and_accept(
            client, db_session, email_outbox, agency.id, agency_client.id, owner, "casey@northwind.example"
        )

        ctx = (await client.get("/portal/context", headers=auth_headers(contact))).json()
        assert ctx["client"]["primary_color"] == "#112233"
        assert ctx["client"]["welcome_message"] == "Welcome aboard!"
        assert ctx["client"]["has_logo"] is False

    async def test_logo_falls_back_to_the_agencys_own(self, client, db_session, email_outbox, team) -> None:
        agency, owner, _member, agency_client = team
        contact = await _invite_and_accept(
            client, db_session, email_outbox, agency.id, agency_client.id, owner, "casey2@northwind.example"
        )

        # Neither set yet -> 404.
        assert (await client.get("/portal/logo", headers=auth_headers(contact))).status_code == 404

        # Only the agency's own logo -> that's what streams.
        await client.put(f"/agencies/{agency.id}/logo", files={"file": PNG}, headers=auth_headers(owner))
        agency_only = await client.get("/portal/logo", headers=auth_headers(contact))
        assert agency_only.status_code == 200
        assert agency_only.content == PNG[1]

        # The client's own logo, once set, wins over the agency's.
        await client.put(
            f"/agencies/{agency.id}/clients/{agency_client.id}/branding/logo",
            files={"file": OTHER_PNG},
            headers=auth_headers(owner),
        )
        client_wins = await client.get("/portal/logo", headers=auth_headers(contact))
        assert client_wins.status_code == 200
        assert client_wins.content == OTHER_PNG[1]
