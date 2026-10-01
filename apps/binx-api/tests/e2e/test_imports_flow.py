"""
End-to-end tests for ``/agencies/{id}/imports``: parse an upload, review it
with a dry run, then import — skipping duplicates and stopping at the plan
limit (Free: 3 clients, 3 team seats including the owner).
"""

from __future__ import annotations

import pytest

from binx_api.core import email as email_module
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.billing import service as billing_service
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def _real_count_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    """conftest lifts every plan cap; these tests exercise them, so put Free's
    client/team caps back to 3 and make Scale genuinely unlimited."""
    import dataclasses

    from binx_api.modules.billing import models as billing_models

    plans = billing_models.PLANS
    monkeypatch.setitem(plans, "free", dataclasses.replace(plans["free"], max_clients=3, max_team_members=3))
    monkeypatch.setitem(plans, "scale", dataclasses.replace(plans["scale"], max_clients=None, max_team_members=None))


@pytest.fixture
async def agency(db_session, user):
    return await make_agency(db_session, owner=user, name="Import Agency")


class TestParse:
    async def test_parse_returns_columns_rows_and_a_suggested_mapping(self, client, user, agency) -> None:
        response = await client.post(
            f"/agencies/{agency.id}/imports/clients/parse",
            files={"file": ("clients.csv", b"Company,Email\nAcme,hi@acme.com\n", "text/csv")},
            headers=auth_headers(user),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["columns"] == ["Company", "Email"]
        assert body["rows"] == [{"row": 2, "cells": ["Acme", "hi@acme.com"]}]
        assert body["mapping"]["name"] == 0
        assert body["mapping"]["primary_contact_email"] == 1
        assert [f["key"] for f in body["fields"] if f["required"]] == ["name"]

    async def test_bad_files_get_a_clear_error(self, client, user, agency) -> None:
        response = await client.post(
            f"/agencies/{agency.id}/imports/clients/parse",
            files={"file": ("clients.pdf", b"%PDF", "application/pdf")},
            headers=auth_headers(user),
        )
        assert response.status_code == 415
        assert "csv or .xlsx" in response.json()["detail"]

    async def test_members_cant_parse_team_imports(self, client, db_session, agency) -> None:
        member = await make_user(db_session)
        await add_agency_member(db_session, agency=agency, user=member)
        response = await client.post(
            f"/agencies/{agency.id}/imports/team/parse",
            files={"file": ("team.csv", b"Email\na@b.com\n", "text/csv")},
            headers=auth_headers(member),
        )
        assert response.status_code == 403


class TestClientImport:
    async def test_dry_run_then_import_skips_duplicates_and_stops_at_the_plan_limit(
        self, client, user, db_session, agency
    ) -> None:
        await make_client(db_session, agency=agency, name="Existing Co")
        base = f"/agencies/{agency.id}/imports/clients"
        rows = [
            {"row": 2, "name": "Acme", "primary_contact_email": "hi@acme.com"},
            {"row": 3, "name": "existing co"},  # duplicate of an existing client
            {"row": 4, "name": "Beta", "primary_contact_email": "not-an-email"},  # invalid
            {"row": 5, "name": "ACME"},  # duplicate of row 2
            {"row": 6, "name": ""},  # invalid: no name
            {"row": 7, "name": "Gamma"},
            {"row": 8, "name": "Delta"},  # Free = 3 clients: 1 existing + Acme + Gamma
        ]

        review = await client.post(base, json={"rows": rows, "dry_run": True}, headers=auth_headers(user))
        assert review.status_code == 200
        body = review.json()
        assert [r["status"] for r in body["rows"]] == [
            "ok",
            "duplicate",
            "invalid",
            "duplicate",
            "invalid",
            "ok",
            "over_limit",
        ]
        assert "Contact email" in body["rows"][2]["message"]
        assert body["rows"][3]["message"] == "Same client name as row 2"
        assert (body["imported"], body["duplicates"], body["invalid"], body["over_limit"]) == (2, 2, 2, 1)
        assert (body["plan_name"], body["limit"], body["remaining"]) == ("Free", 3, 2)
        # A dry run writes nothing.
        listed = await client.get(f"/agencies/{agency.id}/clients", headers=auth_headers(user))
        assert [c["name"] for c in listed.json()] == ["Existing Co"]

        imported = await client.post(base, json={"rows": rows, "dry_run": False}, headers=auth_headers(user))
        assert imported.json()["imported"] == 2
        listed = await client.get(f"/agencies/{agency.id}/clients", headers=auth_headers(user))
        by_name = {c["name"]: c for c in listed.json()}
        assert set(by_name) == {"Existing Co", "Acme", "Gamma"}
        assert by_name["Acme"]["primary_contact_email"] == "hi@acme.com"
        assert by_name["Acme"]["slug"] == "acme"

    async def test_unlimited_plans_import_everything_with_unique_slugs(self, client, user, db_session, agency) -> None:
        await billing_service.change_plan(db_session, agency, new_plan="scale", actor=user)
        rows = [{"row": index + 2, "name": f"Client {index}"} for index in range(5)] + [
            {"row": 7, "name": "Client-0!"}  # different name, same slug base as "Client 0"
        ]
        response = await client.post(
            f"/agencies/{agency.id}/imports/clients", json={"rows": rows, "dry_run": False}, headers=auth_headers(user)
        )
        assert response.json()["imported"] == 6
        assert response.json()["limit"] is None
        slugs = [
            c["slug"] for c in (await client.get(f"/agencies/{agency.id}/clients", headers=auth_headers(user))).json()
        ]
        assert len(set(slugs)) == 6


class TestTeamImport:
    async def test_invites_skip_members_and_bad_rows_and_stop_at_the_seat_limit(
        self, client, user, db_session, agency, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        sent: list[str] = []

        async def fake_send(*, to: str, **_kwargs) -> None:
            sent.append(to)

        monkeypatch.setattr("binx_api.modules.imports.router.send_agency_invitation_email", fake_send)
        monkeypatch.setattr("binx_api.modules.imports.router._INVITE_EMAIL_INTERVAL_SECONDS", 0)
        base = f"/agencies/{agency.id}/imports/team"
        rows = [
            {"row": 2, "email": "dana@example.com", "role": "Admin"},
            {"row": 3, "email": user.email},  # already the owner
            {"row": 4, "email": "sam@example.com", "role": "owner"},  # invalid role
            {"row": 5, "email": "nope"},  # invalid email
            {"row": 6, "email": "DANA@example.com"},  # duplicate of row 2
            {"row": 7, "email": "lee@example.com"},  # Free = 3 seats: owner + dana + lee
            {"row": 8, "email": "kim@example.com"},
        ]

        response = await client.post(base, json={"rows": rows, "dry_run": False}, headers=auth_headers(user))
        assert response.status_code == 200
        body = response.json()
        assert [r["status"] for r in body["rows"]] == [
            "ok",
            "duplicate",
            "invalid",
            "invalid",
            "duplicate",
            "ok",
            "over_limit",
        ]
        assert body["rows"][1]["message"] == "Already on your team"
        assert sorted(sent) == ["dana@example.com", "lee@example.com"]

        invitations = (await client.get(f"/agencies/{agency.id}/invitations", headers=auth_headers(user))).json()
        assert {(i["email"], i["role"]) for i in invitations} == {
            ("dana@example.com", "admin"),
            ("lee@example.com", "member"),
        }

        # Importing the same file again: both are now "Already invited".
        again = await client.post(base, json={"rows": rows[:1], "dry_run": True}, headers=auth_headers(user))
        assert again.json()["rows"][0]["message"] == "Already invited"

    async def test_members_cant_import_invites(self, client, db_session, agency) -> None:
        member = await make_user(db_session)
        await add_agency_member(db_session, agency=agency, user=member)
        response = await client.post(
            f"/agencies/{agency.id}/imports/team",
            json={"rows": [{"row": 2, "email": "x@example.com"}]},
            headers=auth_headers(member),
        )
        assert response.status_code == 403


class TestTeamSeatLimit:
    async def test_single_invites_count_pending_invites_against_the_plan(self, client, user, agency) -> None:
        base = f"/agencies/{agency.id}/invitations"
        for email in ("a@example.com", "b@example.com"):
            ok = await client.post(base, json={"email": email, "role": "member"}, headers=auth_headers(user))
            assert ok.status_code == 201
        # Owner + 2 pending = Free's 3 seats.
        blocked = await client.post(base, json={"email": "c@example.com", "role": "member"}, headers=auth_headers(user))
        assert blocked.status_code == 402
        assert "3 team members" in blocked.json()["detail"]

        # Re-sending an existing invite doesn't need a new seat.
        resent = await client.post(base, json={"email": "a@example.com", "role": "admin"}, headers=auth_headers(user))
        assert resent.status_code == 201

    async def test_count_team_seats(self, db_session, agency) -> None:
        assert await agencies_service.count_team_seats(db_session, agency.id) == 1


def test_email_module_still_exports_the_invite_sender() -> None:
    # The router imports this by name; keep the import path stable.
    assert callable(email_module.send_agency_invitation_email)
