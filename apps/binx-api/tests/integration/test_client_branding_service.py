"""
Integration tests for the client-portal-branding helpers in
``binx_api.modules.agencies.service`` — lazy creation, the partial-patch
update, and the logo image handling. Mirrors
test_agency_profile_service.py's coverage of the equivalent AgencyProfile
functions.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from binx_api.modules.agencies import service
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\nfake-bytes"


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "agency_upload_dir", str(tmp_path))


@pytest.fixture
async def client(db_session):
    owner = await make_user(db_session)
    agency = await make_agency(db_session, owner=owner)
    return await make_client(db_session, agency=agency)


class TestBranding:
    async def test_lazy_create_then_reuse(self, db_session, client) -> None:
        first = await service.get_or_create_client_branding(db_session, client)
        again = await service.get_or_create_client_branding(db_session, client)
        assert first.id == again.id
        assert first.primary_color is None

    async def test_update_is_a_partial_patch(self, db_session, client) -> None:
        await service.update_client_branding(
            db_session, client, data={"primary_color": "#112233", "welcome_message": "Welcome!"}
        )
        branding = await service.get_or_create_client_branding(db_session, client)
        assert branding.primary_color == "#112233"
        assert branding.welcome_message == "Welcome!"

        # A later update that only sends accent_color leaves the others alone.
        await service.update_client_branding(db_session, client, data={"accent_color": "#445566"})
        branding = await service.get_or_create_client_branding(db_session, client)
        assert branding.primary_color == "#112233"
        assert branding.accent_color == "#445566"
        assert branding.welcome_message == "Welcome!"

        # Explicitly sending a field as None clears it.
        await service.update_client_branding(db_session, client, data={"primary_color": None})
        branding = await service.get_or_create_client_branding(db_session, client)
        assert branding.primary_color is None


class TestLogo:
    async def test_save_rejects_a_non_image(self, db_session, client) -> None:
        with pytest.raises(HTTPException) as exc:
            await service.save_client_logo(db_session, client, content=b"not an image", mime_type="text/plain")
        assert exc.value.status_code == 415

    async def test_save_rejects_an_oversize_image(self, db_session, client, monkeypatch) -> None:
        monkeypatch.setattr(service.settings, "agency_image_max_bytes", 4)
        with pytest.raises(HTTPException) as exc:
            await service.save_client_logo(db_session, client, content=PNG, mime_type="image/png")
        assert exc.value.status_code == 413

    async def test_save_then_replace_then_clear(self, db_session, client) -> None:
        branding = await service.save_client_logo(db_session, client, content=PNG, mime_type="image/png")
        first_path = branding.logo_storage_path
        assert first_path is not None
        assert branding.logo_mime_type == "image/png"

        branding = await service.save_client_logo(
            db_session, client, content=b"\x89PNG\r\n\x1a\nother", mime_type="image/webp"
        )
        assert branding.logo_storage_path != first_path
        assert branding.logo_mime_type == "image/webp"
        assert not Path(first_path).exists()

        branding = await service.clear_client_logo(db_session, client)
        assert branding.logo_storage_path is None
        assert branding.logo_mime_type is None

    async def test_delete_client_cleans_up_the_uploaded_logo(self, db_session, client) -> None:
        branding = await service.save_client_logo(db_session, client, content=PNG, mime_type="image/png")
        logo_path = Path(branding.logo_storage_path)
        assert logo_path.exists()

        await service.delete_client(db_session, client)
        assert not logo_path.exists()
