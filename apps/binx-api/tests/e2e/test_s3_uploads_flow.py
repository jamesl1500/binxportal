"""
End-to-end upload journeys with ``UPLOAD_BUCKET`` set — the real routers and
services against the in-memory ``FakeS3`` (see ``tests/conftest.py``), the
same path production and staging take. Every other upload test runs the
local-disk backend.
"""

from __future__ import annotations

import pytest

from binx_api.modules.projects import service as projects_service
from tests.conftest import DEFAULT_PASSWORD, FAKE_BUCKET, FakeS3, auth_headers
from tests.factories import make_agency, make_client

pytestmark = pytest.mark.e2e

PNG = ("avatar.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


async def test_avatar_upload_download_replace_and_clear(auth_client, user, fake_s3: FakeS3) -> None:
    assert (await auth_client.put("/users/me/avatar", files={"file": PNG})).status_code == 200
    [first_key] = fake_s3.keys()
    assert first_key.startswith(f"agencies/users/{user.id}/avatar_")

    got = await auth_client.get("/users/me/avatar")
    assert got.status_code == 200
    assert got.content == PNG[1]
    assert got.headers["content-type"] == "image/png"

    # A re-upload replaces the object rather than piling up a second one.
    await auth_client.put("/users/me/avatar", files={"file": ("new.png", b"\x89PNG-new", "image/png")})
    [second_key] = fake_s3.keys()
    assert second_key != first_key
    assert (await auth_client.get("/users/me/avatar")).content == b"\x89PNG-new"

    assert (await auth_client.delete("/users/me/avatar")).status_code == 200
    assert fake_s3.keys() == []
    assert (await auth_client.get("/users/me/avatar")).status_code == 404


async def test_deleting_the_account_clears_its_images(auth_client, user, fake_s3: FakeS3) -> None:
    await auth_client.put("/users/me/avatar", files={"file": PNG})
    await auth_client.put("/users/me/cover", files={"file": PNG})
    assert len(fake_s3.keys()) == 2

    deleted = await auth_client.request("DELETE", "/users/me", json={"current_password": DEFAULT_PASSWORD})
    assert deleted.status_code == 200
    assert fake_s3.keys() == []


async def test_project_file_downloads_with_its_original_name(client, db_session, user, fake_s3: FakeS3) -> None:
    agency = await make_agency(db_session, owner=user)
    client_row = await make_client(db_session, agency=agency)
    project = await projects_service.create_project(
        db_session,
        agency,
        created_by=user,
        client_id=client_row.id,
        name="Launch Site",
        description=None,
        status_="active",
        start_date=None,
        due_date=None,
    )
    headers = auth_headers(user)
    base = f"/agencies/{agency.id}/projects/{project.id}"

    name = "Q3 résumé.pdf"
    upload = await client.post(f"{base}/files", files={"file": (name, b"%PDF-1.4", "application/pdf")}, headers=headers)
    assert upload.status_code == 201
    [key] = fake_s3.keys()
    assert key.startswith(f"projects/{project.id}/")
    assert fake_s3.objects[(FAKE_BUCKET, key)][1] == "application/pdf"

    download = await client.get(f"{base}/files/{upload.json()['id']}/download", headers=headers)
    assert download.status_code == 200
    assert download.content == b"%PDF-1.4"
    assert download.headers["content-disposition"] == "attachment; filename*=utf-8''Q3%20r%C3%A9sum%C3%A9.pdf"

    assert (await client.delete(f"{base}/files/{upload.json()['id']}", headers=headers)).status_code == 204
    assert fake_s3.keys() == []
