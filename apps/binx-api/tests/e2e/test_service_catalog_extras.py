"""End-to-end: the services catalog's categories, "starting from" prices,
and photos and PDFs, including those files travelling onto proposals."""

from __future__ import annotations

import pytest
from sqlalchemy import event

from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.e2e

PNG = b"\x89PNG\r\n\x1a\n fake photo"
PDF = b"%PDF-1.4 spec sheet"


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _service(client, agency, owner, **fields) -> dict:
    body = {"name": "Brand identity", "pricing_type": "fixed", "unit_price_cents": 250_000} | fields
    resp = await client.post(f"/agencies/{agency.id}/services", json=body, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _category(client, agency, owner, name: str) -> dict:
    resp = await client.post(
        f"/agencies/{agency.id}/service-categories", json={"name": name}, headers=auth_headers(owner)
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(client, agency, owner, service_id, name="photo.png", body=PNG, mime="image/png"):
    return await client.post(
        f"/agencies/{agency.id}/services/{service_id}/attachments",
        files={"file": (name, body, mime)},
        headers=auth_headers(owner),
    )


class TestCategories:
    async def test_services_sit_in_categories(self, client, ctx) -> None:
        agency, owner = ctx
        branding = await _category(client, agency, owner, "Branding")
        web = await _category(client, agency, owner, "Web")
        service = await _service(client, agency, owner, category_id=branding["id"])
        assert (service["category_id"], service["category_name"]) == (branding["id"], "Branding")

        listed = (await client.get(f"/agencies/{agency.id}/service-categories", headers=auth_headers(owner))).json()
        assert [(c["name"], c["service_count"]) for c in listed] == [("Branding", 1), ("Web", 0)]

        moved = await client.patch(
            f"/agencies/{agency.id}/services/{service['id']}",
            json={"category_id": web["id"]},
            headers=auth_headers(owner),
        )
        assert moved.json()["category_name"] == "Web"
        # Sending null takes it out of any category; leaving it out changes nothing.
        kept = await client.patch(
            f"/agencies/{agency.id}/services/{service['id']}", json={"name": "Identity"}, headers=auth_headers(owner)
        )
        assert kept.json()["category_name"] == "Web"
        cleared = await client.patch(
            f"/agencies/{agency.id}/services/{service['id']}", json={"category_id": None}, headers=auth_headers(owner)
        )
        assert cleared.json()["category_id"] is None

    async def test_renaming_reordering_and_deleting(self, client, ctx) -> None:
        agency, owner = ctx
        branding = await _category(client, agency, owner, "Branding")
        await _category(client, agency, owner, "Web")
        service = await _service(client, agency, owner, category_id=branding["id"])

        duplicate = await client.post(
            f"/agencies/{agency.id}/service-categories", json={"name": "web"}, headers=auth_headers(owner)
        )
        assert duplicate.status_code == 409
        renamed = await client.patch(
            f"/agencies/{agency.id}/service-categories/{branding['id']}",
            json={"name": "Brand", "position": 5},
            headers=auth_headers(owner),
        )
        assert (renamed.json()["name"], renamed.json()["position"], renamed.json()["service_count"]) == (
            "Brand",
            5,
            1,
        )
        listed = (await client.get(f"/agencies/{agency.id}/service-categories", headers=auth_headers(owner))).json()
        assert [c["name"] for c in listed] == ["Web", "Brand"]

        deleted = await client.delete(
            f"/agencies/{agency.id}/service-categories/{branding['id']}", headers=auth_headers(owner)
        )
        assert deleted.status_code == 204
        services = (await client.get(f"/agencies/{agency.id}/services", headers=auth_headers(owner))).json()
        assert [s["category_id"] for s in services if s["id"] == service["id"]] == [None]

    async def test_members_read_owners_and_admins_manage(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        member = await make_user(db_session, email="m@northlight.example", full_name="Mo Member")
        await add_agency_member(db_session, agency=agency, user=member)
        await _category(client, agency, owner, "Branding")
        headers = auth_headers(member)
        assert (await client.get(f"/agencies/{agency.id}/service-categories", headers=headers)).status_code == 200
        refused = await client.post(f"/agencies/{agency.id}/service-categories", json={"name": "X"}, headers=headers)
        assert refused.status_code == 403

    async def test_another_agencys_category_cant_be_used(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        other_owner = await make_user(db_session, email="o@other.example", full_name="Other")
        other = await make_agency(db_session, owner=other_owner, name="Other")
        theirs = await _category(client, other, other_owner, "Theirs")
        resp = await client.post(
            f"/agencies/{agency.id}/services",
            json={"name": "X", "unit_price_cents": 1, "category_id": theirs["id"]},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 404


class TestStartingPrice:
    async def test_a_price_can_be_where_it_starts(self, client, ctx) -> None:
        agency, owner = ctx
        service = await _service(client, agency, owner, is_starting_price=True)
        assert service["is_starting_price"] is True
        edited = await client.patch(
            f"/agencies/{agency.id}/services/{service['id']}",
            json={"unit_price_cents": 300_000},
            headers=auth_headers(owner),
        )
        assert (edited.json()["unit_price_cents"], edited.json()["is_starting_price"]) == (300_000, True)
        fixed = await client.patch(
            f"/agencies/{agency.id}/services/{service['id']}",
            json={"is_starting_price": False},
            headers=auth_headers(owner),
        )
        assert fixed.json()["is_starting_price"] is False


class TestFiles:
    async def test_photos_and_pdfs_on_a_service(self, client, ctx, fake_s3) -> None:
        agency, owner = ctx
        service = await _service(client, agency, owner)
        photo = await _upload(client, agency, owner, service["id"])
        assert photo.status_code == 201, photo.text
        pdf = await _upload(client, agency, owner, service["id"], "spec.pdf", PDF, "application/pdf")
        assert pdf.status_code == 201

        read = (await client.get(f"/agencies/{agency.id}/services", headers=auth_headers(owner))).json()[0]
        assert [(a["file_name"], a["mime_type"]) for a in read["attachments"]] == [
            ("photo.png", "image/png"),
            ("spec.pdf", "application/pdf"),
        ]
        inline = await client.get(
            f"/agencies/{agency.id}/services/{service['id']}/attachments/{photo.json()['id']}/download?inline=true",
            headers=auth_headers(owner),
        )
        assert inline.content == PNG
        assert "attachment" not in inline.headers.get("content-disposition", "")

        removed = await client.delete(
            f"/agencies/{agency.id}/services/{service['id']}/attachments/{photo.json()['id']}",
            headers=auth_headers(owner),
        )
        assert removed.status_code == 204
        # Deleting the service takes its files with it.
        await client.delete(f"/agencies/{agency.id}/services/{service['id']}", headers=auth_headers(owner))
        assert not [key for key in fake_s3.keys() if "/services/" in key]

    async def test_only_photos_and_pdfs_and_only_ten(self, client, ctx, fake_s3) -> None:
        agency, owner = ctx
        service = await _service(client, agency, owner)
        text = await _upload(client, agency, owner, service["id"], "notes.txt", b"hello", "text/plain")
        assert text.status_code == 415
        for i in range(10):
            assert (await _upload(client, agency, owner, service["id"], f"p{i}.png")).status_code == 201
        assert (await _upload(client, agency, owner, service["id"], "p10.png")).status_code == 409

    async def test_a_services_files_join_a_draft_proposal_once(self, client, ctx, fake_s3) -> None:
        agency, owner = ctx
        headers = auth_headers(owner)
        identity = await _service(client, agency, owner)
        await _upload(client, agency, owner, identity["id"])
        await _upload(client, agency, owner, identity["id"], "spec.pdf", PDF, "application/pdf")
        site = await _service(client, agency, owner, name="Website")
        await _upload(client, agency, owner, site["id"], "site.png")

        line = {"description": "Brand identity", "quantity": "1", "unit_price_cents": 250_000}
        created = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "Brand", "line_items": [line | {"service_id": identity["id"]}]},
            headers=headers,
        )
        proposal = created.json()
        assert [a["file_name"] for a in proposal["attachments"]] == ["photo.png", "spec.pdf"]

        # Removed from the draft, a file stays removed on the next save...
        photo = proposal["attachments"][0]["id"]
        await client.delete(f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments/{photo}", headers=headers)
        # ...while a newly added service brings its own.
        updated = await client.patch(
            f"/agencies/{agency.id}/proposals/{proposal['id']}",
            json={
                "title": "Brand",
                "line_items": [
                    line | {"service_id": identity["id"]},
                    line | {"description": "Website", "service_id": site["id"]},
                ],
            },
            headers=headers,
        )
        assert sorted(a["file_name"] for a in updated.json()["attachments"]) == ["site.png", "spec.pdf"]


async def test_the_catalog_list_doesnt_grow_queries_with_files(client, ctx, engine, fake_s3) -> None:
    agency, owner = ctx
    headers = auth_headers(owner)
    category = await _category(client, agency, owner, "Branding")

    async def count_for_list() -> int:
        statements = 0

        def bump(*_args, **_kwargs) -> None:
            nonlocal statements
            statements += 1

        event.listen(engine.sync_engine, "before_cursor_execute", bump)
        try:
            assert (await client.get(f"/agencies/{agency.id}/services", headers=headers)).status_code == 200
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", bump)
        return statements

    for i in range(2):
        s = await _service(client, agency, owner, name=f"S{i}", category_id=category["id"])
        await _upload(client, agency, owner, s["id"])
    small = await count_for_list()
    for i in range(2, 8):
        s = await _service(client, agency, owner, name=f"S{i}", category_id=category["id"])
        await _upload(client, agency, owner, s["id"])
        await _upload(client, agency, owner, s["id"], "spec.pdf", PDF, "application/pdf")
    assert await count_for_list() == small
