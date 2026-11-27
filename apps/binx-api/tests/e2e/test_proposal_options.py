"""End-to-end: packages and add-ons. A proposal can offer packages (the
recipient picks one) and optional add-ons (ticked or not) before signing.
Only what's chosen counts toward the totals, goes into the signed document,
and is billed once the proposal is accepted."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}

PACKAGES = [
    {"key": "essential", "name": "Essential", "description": "The site, done well."},
    {"key": "complete", "name": "Complete", "description": "The site, plus the brand.", "recommended": True},
]
LINES = [
    # In every option.
    {"description": "Discovery workshop", "quantity": "1", "unit_price_cents": 200_000},
    {"description": "Five-page website", "quantity": "1", "unit_price_cents": 600_000, "package_key": "essential"},
    {"description": "Ten-page website", "quantity": "1", "unit_price_cents": 900_000, "package_key": "complete"},
    {"description": "Brand identity", "quantity": "1", "unit_price_cents": 400_000, "package_key": "complete"},
    # Add-ons: one ticked to start, one not, one only in Complete, one monthly.
    {"description": "Copywriting", "quantity": "1", "unit_price_cents": 150_000, "optional": True},
    {"description": "SEO setup", "quantity": "1", "unit_price_cents": 80_000, "optional": True, "selected": False},
    {
        "description": "Brand guidelines",
        "quantity": "1",
        "unit_price_cents": 120_000,
        "optional": True,
        "selected": False,
        "package_key": "complete",
    },
    {
        "description": "Care plan",
        "quantity": "1",
        "unit_price_cents": 30_000,
        "optional": True,
        "selected": False,
        "billing": "monthly",
    },
]


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _create(client, agency, owner, **fields):
    payload = {
        "title": "Website",
        "recipient_email": "jane@fjord.example",
        "packages": PACKAGES,
        "line_items": LINES,
    } | fields
    return await client.post(f"/agencies/{agency.id}/proposals", json=payload, headers=auth_headers(owner))


async def _sent(client, agency, owner, **fields) -> dict:
    created = await _create(client, agency, owner, **fields)
    assert created.status_code == 201, created.text
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


def _line(proposal: dict, description: str) -> dict:
    return next(line for line in proposal["line_items"] if line["description"] == description)


def _package(proposal: dict, name: str) -> dict:
    return next(package for package in proposal["packages"] if package["name"] == name)


async def _choose(client, sent: dict, package: str | None, *add_ons: str):
    body = {
        "package_id": _package(sent, package)["id"] if package else None,
        "add_on_ids": [_line(sent, name)["id"] for name in add_ons],
    }
    return await client.put(f"/proposals/public/{_token(sent['share_url'])}/options", json=body, headers=CHROME)


async def _sign(client, sent: dict, document_hash: str):
    return await client.post(
        f"/proposals/public/{_token(sent['share_url'])}/sign",
        json={
            "signer_name": "Jane Prospect",
            "signer_email": "jane@fjord.example",
            "consent": True,
            "document_hash": document_hash,
        },
        headers=CHROME,
    )


class TestDrafting:
    async def test_the_recommended_package_and_ticked_add_ons_make_the_starting_totals(self, client, ctx) -> None:
        agency, owner = ctx
        resp = await _create(client, agency, owner)
        assert resp.status_code == 201, resp.text
        proposal = resp.json()

        complete, essential = _package(proposal, "Complete"), _package(proposal, "Essential")
        assert (complete["selected"], complete["recommended"]) == (True, True)
        assert essential["selected"] is False
        # A package's price is its own required lines.
        assert (essential["price_cents"], complete["price_cents"]) == (600_000, 1_300_000)
        # Discovery + Ten-page website + Brand identity + Copywriting (ticked).
        assert proposal["subtotal_cents"] == 200_000 + 900_000 + 400_000 + 150_000
        assert proposal["monthly_total_cents"] == 0
        included = {line["description"]: line["included"] for line in proposal["line_items"]}
        assert included == {
            "Discovery workshop": True,
            "Five-page website": False,
            "Ten-page website": True,
            "Brand identity": True,
            "Copywriting": True,
            "SEO setup": False,
            "Brand guidelines": False,
            "Care plan": False,
        }
        assert _line(proposal, "Ten-page website")["package_id"] == complete["id"]

    async def test_without_a_recommendation_the_first_package_starts_selected(self, client, ctx) -> None:
        agency, owner = ctx
        packages = [{**package, "recommended": False} for package in PACKAGES]
        proposal = (await _create(client, agency, owner, packages=packages)).json()
        assert _package(proposal, "Essential")["selected"] is True
        assert proposal["subtotal_cents"] == 200_000 + 600_000 + 150_000

    async def test_editing_a_draft_replaces_the_packages(self, client, ctx) -> None:
        agency, owner = ctx
        proposal = (await _create(client, agency, owner)).json()
        updated = await client.patch(
            f"/agencies/{agency.id}/proposals/{proposal['id']}",
            json={
                "title": "Website",
                "packages": [{"key": "a", "name": "Small"}, {"key": "b", "name": "Large", "recommended": True}],
                "line_items": [
                    {"description": "Small site", "quantity": "1", "unit_price_cents": 100, "package_key": "a"},
                    {"description": "Large site", "quantity": "1", "unit_price_cents": 300, "package_key": "b"},
                ],
            },
            headers=auth_headers(owner),
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert [package["name"] for package in body["packages"]] == ["Small", "Large"]
        assert body["subtotal_cents"] == 300

        # And dropping them all leaves a plain proposal.
        plain = await client.patch(
            f"/agencies/{agency.id}/proposals/{proposal['id']}",
            json={"title": "Website", "line_items": [{"description": "Site", "quantity": "1", "unit_price_cents": 5}]},
            headers=auth_headers(owner),
        )
        assert plain.json()["packages"] == []
        assert plain.json()["subtotal_cents"] == 5

    @pytest.mark.parametrize(
        ("packages", "lines", "message"),
        [
            ([PACKAGES[0]], LINES[:2], "at least two packages"),
            ([PACKAGES[0], {**PACKAGES[1], "name": "essential"}], LINES[:3], "different name"),
            ([PACKAGES[0], {**PACKAGES[1], "key": "essential"}], LINES[:3], "its own key"),
            ([{**PACKAGES[0], "recommended": True}, PACKAGES[1]], LINES[:3], "one package at most"),
            (PACKAGES, LINES[:2], "Add at least one line to the Complete package"),
            (PACKAGES, [*LINES[:3], {**LINES[0], "package_key": "premium"}], "isn't on the proposal"),
            ([], LINES[:2], "isn't on the proposal"),
        ],
    )
    async def test_packages_that_dont_hang_together_are_refused(self, client, ctx, packages, lines, message) -> None:
        agency, owner = ctx
        resp = await _create(client, agency, owner, packages=packages, line_items=lines)
        assert resp.status_code == 422
        assert message in resp.text


class TestChoosing:
    async def test_the_recipient_picks_a_package_and_add_ons_and_signs_exactly_that(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)

        resp = await _choose(client, sent, "Essential", "SEO setup", "Care plan")
        assert resp.status_code == 200, resp.text
        chosen = resp.json()
        assert _package(chosen, "Essential")["selected"] is True
        # Discovery + Five-page website + SEO setup; Copywriting unticked.
        assert chosen["subtotal_cents"] == 200_000 + 600_000 + 80_000
        assert chosen["monthly_total_cents"] == 30_000
        assert chosen["document_hash"] != sent["document_hash"]

        # The fingerprint they were sent no longer matches what they chose.
        stale = await _sign(client, sent, sent["document_hash"])
        assert stale.status_code == 409
        signed = await _sign(client, sent, chosen["document_hash"])
        assert signed.status_code == 200, signed.text

        certificate = (await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate")).json()
        assert certificate["document_intact"] and certificate["signature_matches_document"]
        assert certificate["package_name"] == "Essential"
        assert [(line["description"], line["add_on"]) for line in certificate["line_items"]] == [
            ("Discovery workshop", False),
            ("Five-page website", False),
            ("SEO setup", True),
            ("Care plan", True),
        ]
        assert certificate["subtotal_cents"] == 880_000
        events = [(event["kind"], event["detail"]) for event in certificate["events"]]
        assert ("options_chosen", "Chose the Essential package, with SEO setup and Care plan") in events

        pdf = await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate.pdf")
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")

        # Signed: the choice is locked.
        again = await _choose(client, sent, "Complete")
        assert again.status_code == 409

    async def test_choosing_the_same_thing_again_changes_nothing(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        same = await _choose(client, sent, "Complete", "Copywriting")
        assert same.status_code == 200
        assert same.json()["document_hash"] == sent["document_hash"]
        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        assert "options_chosen" not in [event["kind"] for event in events.json()]

    async def test_switching_back_finds_a_packages_add_ons_as_they_were(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        await _choose(client, sent, "Complete", "Brand guidelines")
        await _choose(client, sent, "Essential")
        back = (await _choose(client, sent, "Complete", *[])).json()
        # Brand guidelines is a Complete add-on: choosing Essential (where it
        # isn't offered) left it alone; this choice then unticked it.
        assert _line(back, "Brand guidelines")["selected"] is False
        middle = (await _choose(client, sent, "Essential")).json()
        assert _line(middle, "Brand guidelines")["included"] is False

    @pytest.mark.parametrize(
        ("package", "add_ons", "status", "message"),
        [
            (None, (), 422, "Choose one of the packages"),
            ("Essential", ("Brand guidelines",), 422, "isn't part of the Essential package"),
            ("Complete", ("Ten-page website",), 422, "isn't on this proposal"),
        ],
    )
    async def test_a_choice_that_doesnt_fit_is_refused(self, client, ctx, package, add_ons, status, message) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        resp = await _choose(client, sent, package, *add_ons)
        assert resp.status_code == status
        assert message in resp.text

    async def test_add_ons_without_packages(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, packages=[], line_items=[LINES[0], LINES[4], LINES[5]])
        assert sent["packages"] == []
        assert sent["subtotal_cents"] == 350_000

        resp = await _choose(client, sent, None)
        assert resp.json()["subtotal_cents"] == 200_000
        package_given = await client.put(
            f"/proposals/public/{_token(sent['share_url'])}/options",
            json={"package_id": sent["line_items"][0]["id"], "add_on_ids": []},
        )
        assert package_given.status_code == 422
        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        assert [event["detail"] for event in events.json() if event["kind"] == "options_chosen"] == ["Chose no add-ons"]

    async def test_a_draft_cant_be_chosen_from(self, client, ctx) -> None:
        agency, owner = ctx
        draft = (await _create(client, agency, owner)).json()
        resp = await _choose(client, draft, "Essential")
        assert resp.status_code == 409


class TestPortalAndAcceptance:
    async def test_a_portal_contact_chooses_and_only_the_chosen_lines_are_billed(self, client, ctx, db_session) -> None:
        from binx_api.modules.invoicing.models import RecurringInvoiceLineItem

        agency, owner = ctx
        client_row = await make_client(db_session, agency=agency, name="Acme")
        contact = await make_user(db_session, email="dana@acme.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact)
        lines = [
            *LINES,
            {
                "description": "Hosting",
                "quantity": "1",
                "unit_price_cents": 5_000,
                "billing": "monthly",
                "package_key": "essential",
            },
        ]
        sent = await _sent(
            client, agency, owner, client_id=str(client_row.id), recipient_email="dana@acme.example", line_items=lines
        )

        chosen = await client.put(
            f"/portal/proposals/{sent['id']}/options",
            json={"package_id": _package(sent, "Essential")["id"], "add_on_ids": []},
            headers=auth_headers(contact),
        )
        assert chosen.status_code == 200, chosen.text
        assert chosen.json()["monthly_total_cents"] == 5_000
        signed = await client.post(
            f"/portal/proposals/{sent['id']}/sign",
            json={"consent": True, "document_hash": chosen.json()["document_hash"]},
            headers=auth_headers(contact),
        )
        assert signed.status_code == 200, signed.text

        staff = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}", headers=auth_headers(owner))
        acceptance = staff.json()["acceptance"]
        assert acceptance["status"] == "done"
        rows = await db_session.execute(
            select(RecurringInvoiceLineItem).where(
                RecurringInvoiceLineItem.schedule_id == acceptance["retainer_schedule_id"]
            )
        )
        # Hosting (Essential's monthly line), not the unticked care plan.
        assert [line.description for line in rows.scalars()] == ["Hosting"]
        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        chose = next(event for event in events.json() if event["kind"] == "options_chosen")
        assert chose["actor_label"].startswith("Dana Client")


class TestEdges:
    async def test_the_deposit_is_a_share_of_what_was_chosen(self, client, ctx) -> None:
        agency, owner = ctx
        lead = (
            await client.post(
                f"/agencies/{agency.id}/leads",
                json={"name": "Fjord & Field", "contact_name": "Jane", "contact_email": "jane@fjord.example"},
                headers=auth_headers(owner),
            )
        ).json()
        sent = await _sent(client, agency, owner, lead_id=lead["id"], deposit_percent="50")
        chosen = (await _choose(client, sent, "Essential", "SEO setup")).json()
        assert chosen["total_cents"] == 880_000
        assert (await _sign(client, sent, chosen["document_hash"])).status_code == 200

        staff = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}", headers=auth_headers(owner))
        invoice_id = staff.json()["acceptance"]["deposit_invoice_id"]
        invoice = await client.get(f"/agencies/{agency.id}/invoices/{invoice_id}", headers=auth_headers(owner))
        assert invoice.json()["total_cents"] == 440_000

    async def test_choosing_the_original_again_gives_the_original_fingerprint(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        changed = (await _choose(client, sent, "Essential")).json()
        assert changed["document_hash"] != sent["document_hash"]
        back = (await _choose(client, sent, "Complete", "Copywriting")).json()
        assert back["document_hash"] == sent["document_hash"]
        assert back["total_cents"] == sent["total_cents"]

    async def test_an_expired_proposal_cant_be_changed(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, valid_until="2020-01-01T00:00:00Z")
        resp = await _choose(client, sent, "Essential")
        assert resp.status_code == 409
        assert "expired" in resp.json()["detail"]

    async def test_another_clients_contact_cant_choose(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        mine = await make_client(db_session, agency=agency, name="Acme")
        theirs = await make_client(db_session, agency=agency, name="Globex")
        stranger = await make_user(db_session, email="gil@globex.example", full_name="Gil Globex")
        await make_client_contact(db_session, agency=agency, client=theirs, user=stranger)
        sent = await _sent(client, agency, owner, client_id=str(mine.id))
        resp = await client.put(
            f"/portal/proposals/{sent['id']}/options",
            json={"package_id": _package(sent, "Essential")["id"], "add_on_ids": []},
            headers=auth_headers(stranger),
        )
        assert resp.status_code == 404

    async def test_the_countersignature_is_on_the_chosen_version(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, requires_countersign=True)
        chosen = (await _choose(client, sent, "Essential")).json()
        assert (await _sign(client, sent, chosen["document_hash"])).status_code == 200
        # Once the client has signed, the choice is locked for everyone.
        assert (await _choose(client, sent, "Complete")).status_code == 409

        countersigned = await client.post(
            f"/agencies/{agency.id}/proposals/{sent['id']}/countersign",
            json={"consent": True, "document_hash": chosen["document_hash"]},
            headers=auth_headers(owner),
        )
        assert countersigned.status_code == 200, countersigned.text
        certificate = (await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate")).json()
        assert certificate["package_name"] == "Essential"
        assert certificate["countersignature"]["document_hash"] == chosen["document_hash"]
        assert certificate["document_intact"] is True
