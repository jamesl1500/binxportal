"""
End-to-end tests for the agency-profile + logo/cover endpoints.

Reading is open to any member; editing and uploads are owner/admin. The logo
also surfaces on ``GET /agencies/mine`` as ``has_logo`` + a ``logo_version``.
"""

from __future__ import annotations

import pytest

from binx_api.modules.agencies import service
from binx_api.modules.agencies.models import ROLE_MEMBER, AgencyMember
from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e

PNG = ("logo.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


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
    return agency, owner, member


class TestProfile:
    async def test_member_reads_owner_writes(self, client, team) -> None:
        agency, owner, member = team
        base = f"/agencies/{agency.id}/profile"

        read = await client.get(base, headers=auth_headers(member))
        assert read.status_code == 200
        assert read.json()["tagline"] is None
        assert read.json()["has_logo"] is False

        assert (await client.patch(base, json={"tagline": "hi"}, headers=auth_headers(member))).status_code == 403

        updated = await client.patch(
            base,
            json={"tagline": "We ship", "brand_color": "#0a0a0b", "founded_year": 2020, "working_policy": "Be kind"},
            headers=auth_headers(owner),
        )
        assert updated.status_code == 200
        assert updated.json()["brand_color"] == "#0a0a0b"
        assert updated.json()["working_policy"] == "Be kind"

    async def test_bad_brand_colour_is_rejected(self, client, team) -> None:
        agency, owner, _member = team
        response = await client.patch(
            f"/agencies/{agency.id}/profile", json={"brand_color": "blue"}, headers=auth_headers(owner)
        )
        assert response.status_code == 422


class TestImages:
    async def test_upload_download_and_clear_the_logo(self, client, team) -> None:
        agency, owner, member = team
        base = f"/agencies/{agency.id}"

        uploaded = await client.put(f"{base}/logo", files={"file": PNG}, headers=auth_headers(owner))
        assert uploaded.status_code == 200
        assert uploaded.json()["has_logo"] is True
        assert uploaded.json()["logo_version"]

        # Any member can fetch the bytes.
        got = await client.get(f"{base}/logo", headers=auth_headers(member))
        assert got.status_code == 200
        assert got.content == PNG[1]

        # It shows up on /agencies/mine.
        mine = (await client.get("/agencies/mine", headers=auth_headers(member))).json()
        row = next(a for a in mine if a["id"] == str(agency.id))
        assert row["has_logo"] is True
        assert row["logo_version"] == uploaded.json()["logo_version"]

        # A member can't upload.
        assert (await client.put(f"{base}/logo", files={"file": PNG}, headers=auth_headers(member))).status_code == 403

        cleared = await client.delete(f"{base}/logo", headers=auth_headers(owner))
        assert cleared.json()["has_logo"] is False
        assert (await client.get(f"{base}/logo", headers=auth_headers(member))).status_code == 404

    async def test_a_non_image_is_rejected(self, client, team) -> None:
        agency, owner, _member = team
        response = await client.put(
            f"/agencies/{agency.id}/logo",
            files={"file": ("notes.txt", b"hello", "text/plain")},
            headers=auth_headers(owner),
        )
        assert response.status_code == 415
