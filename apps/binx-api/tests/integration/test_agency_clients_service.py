"""
Integration tests for the client half of ``binx_api.modules.agencies.service``
— create (+ per-agency slug uniqueness), the active-first listing order,
update, archive/restore, and the "can't delete a client that still has
projects" guard.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from binx_api.modules.agencies import service
from tests.factories import make_agency, make_client, make_project, make_user

pytestmark = pytest.mark.integration


async def _new_client(db_session, agency, name):
    return await service.create_client(
        db_session,
        agency,
        name=name,
        primary_contact_name=None,
        primary_contact_email=None,
        primary_contact_phone=None,
        website=None,
        notes=None,
    )


class TestCreateClient:
    async def test_generates_a_slug_from_the_name(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await _new_client(db_session, agency, "Northwind Traders")
        assert client.slug == "northwind-traders"
        assert client.is_active is True

    async def test_slug_is_unique_per_agency_not_globally(self, db_session) -> None:
        owner = await make_user(db_session)
        agency_one = await make_agency(db_session, owner=owner, name="Agency One")
        agency_two = await make_agency(db_session, owner=owner, name="Agency Two")

        a = await _new_client(db_session, agency_one, "Acme")
        b = await _new_client(db_session, agency_two, "Acme")
        c = await _new_client(db_session, agency_one, "Acme")

        assert a.slug == "acme"
        assert b.slug == "acme"  # different agency — no collision
        assert c.slug == "acme-2"  # same agency — disambiguated


class TestListClients:
    async def test_active_clients_come_before_archived_then_alphabetical(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        zebra = await _new_client(db_session, agency, "Zebra")
        apple = await _new_client(db_session, agency, "Apple")
        archived = await _new_client(db_session, agency, "AAA Archived")
        await service.set_client_active(db_session, archived, is_active=False)

        listed = await service.list_clients(db_session, agency.id)
        assert [c.id for c in listed] == [apple.id, zebra.id, archived.id]


class TestUpdateAndArchive:
    async def test_update_is_a_full_replace_and_keeps_the_slug(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await _new_client(db_session, agency, "Before Rename")

        updated = await service.update_client(
            db_session,
            client,
            name="After Rename",
            primary_contact_name="Pat Contact",
            primary_contact_email="pat@example.com",
            primary_contact_phone=None,
            website=None,
            notes="Some notes",
        )
        assert updated.name == "After Rename"
        assert updated.slug == "before-rename"
        assert updated.primary_contact_name == "Pat Contact"

    async def test_archive_then_restore(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await _new_client(db_session, agency, "Toggle Me")

        await service.set_client_active(db_session, client, is_active=False)
        assert client.is_active is False
        await service.set_client_active(db_session, client, is_active=True)
        assert client.is_active is True


class TestDeleteClient:
    async def test_deletes_a_client_with_no_projects(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await _new_client(db_session, agency, "Deletable")
        client_id = client.id

        await service.delete_client(db_session, client)
        assert (await service_get_or_none(db_session, agency.id, client_id)) is None

    async def test_refuses_to_delete_a_client_that_still_has_projects(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency, name="Has Projects")
        await make_project(db_session, agency=agency, created_by=owner, client=client)
        agency_id, client_id = agency.id, client.id  # capture before the failed commit rolls the session back

        with pytest.raises(HTTPException) as exc:
            await service.delete_client(db_session, client)
        assert exc.value.status_code == 409
        # The client is still there after the refusal.
        assert await service.get_client_or_404(db_session, agency_id, client_id)


async def service_get_or_none(db_session, agency_id, client_id):
    try:
        return await service.get_client_or_404(db_session, agency_id, client_id)
    except HTTPException:
        return None
