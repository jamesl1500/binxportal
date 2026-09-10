"""
Integration tests for the agency-profile helpers in
``binx_api.modules.agencies.service`` — lazy creation, the full-replace
update, and the logo/cover image handling.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from binx_api.modules.agencies import service
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\nfake-bytes"


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "agency_upload_dir", str(tmp_path))


@pytest.fixture
async def agency(db_session):
    owner = await make_user(db_session)
    return await make_agency(db_session, owner=owner)


class TestProfile:
    async def test_lazy_create_then_reuse(self, db_session, agency) -> None:
        first = await service.get_or_create_agency_profile(db_session, agency)
        again = await service.get_or_create_agency_profile(db_session, agency)
        assert first.id == again.id
        assert first.tagline is None

    async def test_update_replaces_fields(self, db_session, agency) -> None:
        await service.update_agency_profile(
            db_session,
            agency,
            data={"tagline": "We build things", "about": "A small studio.", "founded_year": 2019},
        )
        profile = await service.get_or_create_agency_profile(db_session, agency)
        assert profile.tagline == "We build things"
        assert profile.founded_year == 2019

        # A later update with a field cleared actually clears it (full replace).
        await service.update_agency_profile(db_session, agency, data={"tagline": None})
        profile = await service.get_or_create_agency_profile(db_session, agency)
        assert profile.tagline is None


class TestImages:
    async def test_save_rejects_a_non_image(self, db_session, agency) -> None:
        with pytest.raises(HTTPException) as exc:
            await service.save_agency_image(
                db_session, agency, kind="logo", content=b"not an image", mime_type="text/plain"
            )
        assert exc.value.status_code == 415

    async def test_save_rejects_an_oversize_image(self, db_session, agency, monkeypatch) -> None:
        monkeypatch.setattr(service.settings, "agency_image_max_bytes", 4)
        with pytest.raises(HTTPException) as exc:
            await service.save_agency_image(db_session, agency, kind="logo", content=PNG, mime_type="image/png")
        assert exc.value.status_code == 413

    async def test_save_then_replace_then_clear(self, db_session, agency) -> None:
        profile = await service.save_agency_image(db_session, agency, kind="logo", content=PNG, mime_type="image/png")
        first_path = profile.logo_storage_path
        assert first_path is not None
        assert profile.logo_mime_type == "image/png"

        # Re-upload — a new file, the old one removed.
        from pathlib import Path

        profile = await service.save_agency_image(
            db_session, agency, kind="logo", content=b"\x89PNG\r\n\x1a\nother", mime_type="image/webp"
        )
        assert profile.logo_storage_path != first_path
        assert profile.logo_mime_type == "image/webp"
        assert not Path(first_path).exists()

        # Clear it.
        profile = await service.clear_agency_image(db_session, agency, kind="logo")
        assert profile.logo_storage_path is None
        assert profile.logo_mime_type is None

    async def test_logo_shows_in_get_agencies_for_user(self, db_session) -> None:
        owner = await make_user(db_session)
        target = await make_agency(db_session, owner=owner, name="Has Logo")
        await make_agency(db_session, owner=owner, name="No Logo")
        await service.save_agency_image(db_session, target, kind="logo", content=PNG, mime_type="image/png")

        rows = await service.get_agencies_for_user(db_session, owner)
        by_name = {a.name: logo for a, _role, logo in rows}
        assert by_name["Has Logo"] is not None
        assert by_name["No Logo"] is None
