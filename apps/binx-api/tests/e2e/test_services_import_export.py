"""End-to-end: importing the services catalog from a spreadsheet, exporting
it, and the export -> import round trip (archived services included)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from binx_api.modules.services.models import Service
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def agency(db_session, user):
    return await make_agency(db_session, owner=user, name="Catalog Agency")


async def _import(client, user, agency, rows: list[dict], *, dry_run: bool = False):
    return await client.post(
        f"/agencies/{agency.id}/imports/services", json={"rows": rows, "dry_run": dry_run}, headers=auth_headers(user)
    )


class TestServiceImport:
    async def test_imports_with_pricing_words_money_and_status(self, client, user, db_session, agency) -> None:
        rows = [
            {"row": 2, "name": "Brand strategy", "price": "$5,000", "pricing": "Flat fee", "description": "Workshops"},
            {"row": 3, "name": "Design retainer", "price": "2000", "pricing": "per month", "default_quantity": "1"},
            {"row": 4, "name": "Dev hours", "price": "150.50", "pricing": "Hourly", "default_quantity": "10"},
            {"row": 5, "name": "Old package", "price": "900", "status": "Archived"},
            {"row": 6, "name": "brand STRATEGY", "price": "1"},  # same name as row 2
            {"row": 7, "name": "No price"},
            {"row": 8, "name": "Weird pricing", "price": "10", "pricing": "weekly"},
            {"row": 9, "name": "Bad price", "price": "lots"},
            {"row": 10, "name": "Bad qty", "price": "10", "default_quantity": "0"},
        ]
        review = await _import(client, user, agency, rows, dry_run=True)
        assert review.status_code == 200, review.text
        body = review.json()
        assert [r["status"] for r in body["rows"]] == [
            "ok",
            "ok",
            "ok",
            "ok",
            "duplicate",
            "invalid",
            "invalid",
            "invalid",
            "invalid",
        ]
        messages = {r["label"]: r["message"] for r in body["rows"]}
        assert messages["brand STRATEGY"] == "Same service name as row 2"
        assert messages["No price"] == "Price is required"
        assert "must be fixed, hourly or monthly" in messages["Weird pricing"]
        assert messages["Bad price"].startswith("Price:")
        assert messages["Bad qty"].startswith("Default quantity:")
        assert body["limit"] is None  # the catalog has no plan cap
        # Dry run writes nothing.
        assert (await db_session.execute(select(Service))).scalars().all() == []

        result = await _import(client, user, agency, rows)
        assert result.json()["imported"] == 4
        services = {
            s.name: s
            for s in (await db_session.execute(select(Service).where(Service.agency_id == agency.id))).scalars().all()
        }
        assert services["Brand strategy"].pricing_type == "fixed"
        assert services["Brand strategy"].unit_price_cents == 500_000
        assert services["Brand strategy"].description == "Workshops"
        assert services["Design retainer"].pricing_type == "monthly"
        assert services["Dev hours"].unit_price_cents == 15_050
        assert services["Dev hours"].default_quantity == Decimal("10.00")
        assert services["Old package"].is_archived is True

    async def test_existing_names_are_skipped_but_archived_ones_can_be_reused(
        self, client, user, db_session, agency
    ) -> None:
        await _import(client, user, agency, [{"row": 2, "name": "Retainer", "price": "100", "status": "archived"}])
        second = await _import(
            client,
            user,
            agency,
            [
                {"row": 2, "name": "Retainer", "price": "200"},  # active again: allowed, the old one is archived
                {"row": 3, "name": "retainer", "price": "300", "status": "Archived"},  # archived copy: skipped
            ],
        )
        assert [r["status"] for r in second.json()["rows"]] == ["ok", "duplicate"]
        third = await _import(client, user, agency, [{"row": 2, "name": "RETAINER", "price": "1"}])
        assert third.json()["rows"][0]["message"] == "You already have a service named “RETAINER”"

    async def test_members_cannot_import_services(self, client, user, db_session, agency) -> None:
        member = await make_user(db_session, email="member@example.com", full_name="Member")
        await add_agency_member(db_session, agency=agency, user=member)
        denied = await _import(client, member, agency, [{"row": 2, "name": "X", "price": "1"}])
        assert denied.status_code == 403
        parse = await client.post(
            f"/agencies/{agency.id}/imports/services/parse",
            files={"file": ("s.csv", b"Service name,Price\nX,1\n", "text/csv")},
            headers=auth_headers(member),
        )
        assert parse.status_code == 403
        # ...but they can still download the catalog, like every other export.
        exported = await client.get(f"/agencies/{agency.id}/exports/services", headers=auth_headers(member))
        assert exported.status_code == 200


class TestServiceRoundTrip:
    async def test_an_export_re_imports_as_the_same_catalog(self, client, user, db_session, agency) -> None:
        await _import(
            client,
            user,
            agency,
            [
                {"row": 2, "name": "Brand strategy", "price": "5000", "description": "Workshops"},
                {"row": 3, "name": "Design retainer", "price": "2000", "pricing": "monthly"},
                {"row": 4, "name": "Dev hours", "price": "150", "pricing": "hourly", "default_quantity": "2.5"},
                {"row": 5, "name": "Old package", "price": "900", "status": "archived"},
            ],
        )
        exported = await client.get(f"/agencies/{agency.id}/exports/services?format=xlsx", headers=auth_headers(user))
        assert exported.status_code == 200

        other = await make_agency(db_session, owner=user, name="Second Agency")
        parsed = await client.post(
            f"/agencies/{other.id}/imports/services/parse",
            files={"file": ("services.xlsx", exported.content, "application/octet-stream")},
            headers=auth_headers(user),
        )
        body = parsed.json()
        assert all(column is not None for column in body["mapping"].values())  # every field auto-matched

        rows = [
            {
                "row": r["row"],
                **{key: (r["cells"][col] if col is not None else None) for key, col in body["mapping"].items()},
            }
            for r in body["rows"]
        ]
        result = await _import(client, user, other, rows)
        assert result.json()["imported"] == 4

        def shape(agency_id):
            return select(
                Service.name,
                Service.description,
                Service.pricing_type,
                Service.unit_price_cents,
                Service.default_quantity,
                Service.is_archived,
            ).where(Service.agency_id == agency_id)

        original = sorted((await db_session.execute(shape(agency.id))).all())
        copy = sorted((await db_session.execute(shape(other.id))).all())
        assert copy == original
