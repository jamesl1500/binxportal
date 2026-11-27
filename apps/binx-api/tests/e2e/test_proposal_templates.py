"""End-to-end: proposal templates (templates.py). Save one from a proposal or
build one, start new proposals from it (documents copied on), and keep it
working when what it points at changes."""

from __future__ import annotations

import pytest

from binx_api.modules.proposals.models import MAX_PROPOSAL_TEMPLATES, ProposalTemplate
from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e

PDF = b"%PDF-1.4 statement of work"

DATA = {
    "title": "Website for {client}",
    "content": "A new site, start to finish.",
    "currency": "USD",
    "tax_rate_percent": "10",
    "valid_for_days": 30,
    "deposit_percent": "25",
    "create_project_on_accept": True,
    "packages": [
        {"key": "e", "name": "Essential"},
        {"key": "c", "name": "Complete", "recommended": True},
    ],
    "line_items": [
        {"description": "Discovery", "quantity": "1", "unit_price_cents": 100_000},
        {"description": "Five pages", "quantity": "1", "unit_price_cents": 400_000, "package_key": "e"},
        {"description": "Ten pages", "quantity": "1", "unit_price_cents": 700_000, "package_key": "c"},
        {"description": "Copy", "quantity": "1", "unit_price_cents": 50_000, "optional": True},
        {"description": "Care", "quantity": "1", "unit_price_cents": 20_000, "optional": True, "billing": "monthly"},
    ],
}


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


def _base(agency) -> str:
    return f"/agencies/{agency.id}/proposal-templates"


async def _template(client, agency, owner, **overrides) -> dict:
    body = {"name": "Website build", "description": "Our standard site", "data": DATA} | overrides
    resp = await client.post(_base(agency), json=body, headers=auth_headers(owner))
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestBuilding:
    async def test_a_template_round_trips_with_its_starting_price(self, client, ctx) -> None:
        agency, owner = ctx
        template = await _template(client, agency, owner)
        assert template["name"] == "Website build"
        assert template["title"] == "Website for {client}"
        assert template["package_names"] == ["Essential", "Complete"]
        assert template["line_count"] == 5
        # Discovery + Ten pages + Copy (pre-selected) = 8,500, + 10% tax.
        assert template["total_cents"] == 935_000
        assert template["monthly_total_cents"] == 22_000
        assert template["data"]["valid_for_days"] == 30
        assert template["data"]["packages"][1]["recommended"] is True

        listed = (await client.get(_base(agency), headers=auth_headers(owner))).json()
        assert [row["name"] for row in listed] == ["Website build"]
        assert "data" not in listed[0]

        updated = await client.put(
            f"{_base(agency)}/{template['id']}",
            json={"name": "Website", "description": None, "data": DATA | {"title": "Site"}},
            headers=auth_headers(owner),
        )
        assert updated.status_code == 200
        assert (updated.json()["name"], updated.json()["title"], updated.json()["description"]) == (
            "Website",
            "Site",
            None,
        )

    @pytest.mark.parametrize(
        ("data", "message"),
        [
            (DATA | {"packages": DATA["packages"][:1]}, "at least two packages"),
            (DATA | {"valid_for_days": 0}, "greater than or equal to 1"),
            (DATA | {"kickoff_template_id": "00000000-0000-0000-0000-000000000000"}, ""),
        ],
    )
    async def test_it_holds_only_what_a_proposal_would(self, client, ctx, data, message) -> None:
        agency, owner = ctx
        resp = await client.post(_base(agency), json={"name": "Bad", "data": data}, headers=auth_headers(owner))
        assert resp.status_code in (404, 422)
        assert message in resp.text

    async def test_another_agencys_template_is_out_of_reach(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        template = await _template(client, agency, owner)
        other_owner = await make_user(db_session, email="x@other.example", full_name="Other Owner")
        other = await make_agency(db_session, owner=other_owner, name="Other")
        headers = auth_headers(other_owner)
        assert (await client.get(f"{_base(other)}/{template['id']}", headers=headers)).status_code == 404
        created = await client.post(
            f"/agencies/{other.id}/proposals",
            json={"title": "X", "template_id": template["id"], "line_items": []},
            headers=headers,
        )
        assert created.status_code == 404

    async def test_there_is_a_cap(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        for i in range(MAX_PROPOSAL_TEMPLATES):
            db_session.add(ProposalTemplate(agency_id=agency.id, name=f"T{i}", data='{"title": "T"}'))
        await db_session.commit()
        resp = await client.post(_base(agency), json={"name": "One more", "data": DATA}, headers=auth_headers(owner))
        assert resp.status_code == 409


class TestUsing:
    async def test_a_proposal_from_a_template_gets_its_documents_and_counts_the_use(self, client, ctx, fake_s3) -> None:
        agency, owner = ctx
        template = await _template(client, agency, owner)
        upload = await client.post(
            f"{_base(agency)}/{template['id']}/attachments",
            files={"file": ("sow.pdf", PDF, "application/pdf")},
            headers=auth_headers(owner),
        )
        assert upload.status_code == 201, upload.text

        # The editor is prefilled from the template's data; create sends it back
        # with the template's id.
        body = {k: v for k, v in DATA.items() if k != "valid_for_days"} | {
            "title": "Website for Fjord",
            "template_id": template["id"],
        }
        created = await client.post(f"/agencies/{agency.id}/proposals", json=body, headers=auth_headers(owner))
        assert created.status_code == 201, created.text
        proposal = created.json()
        assert [a["file_name"] for a in proposal["attachments"]] == ["sow.pdf"]
        assert proposal["attachments"][0]["sha256"] == upload.json()["sha256"]
        assert proposal["total_cents"] == 935_000

        download = await client.get(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments/{proposal['attachments'][0]['id']}/download",
            headers=auth_headers(owner),
        )
        assert download.content == PDF

        # A copy: removing it from the proposal leaves the template's.
        await client.delete(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments/{proposal['attachments'][0]['id']}",
            headers=auth_headers(owner),
        )
        again = (await client.get(f"{_base(agency)}/{template['id']}", headers=auth_headers(owner))).json()
        assert again["attachment_count"] == 1
        assert again["use_count"] == 1
        assert again["last_used_at"] is not None

    async def test_save_a_proposal_as_a_template(self, client, ctx, fake_s3) -> None:
        agency, owner = ctx
        body = {k: v for k, v in DATA.items() if k != "valid_for_days"} | {
            "valid_until": "2030-01-31T00:00:00Z",
            "recipient_email": "jane@fjord.example",
        }
        proposal = (
            await client.post(f"/agencies/{agency.id}/proposals", json=body, headers=auth_headers(owner))
        ).json()
        await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments",
            files={"file": ("terms.pdf", PDF, "application/pdf")},
            headers=auth_headers(owner),
        )
        await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner)
        )

        resp = await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/save-as-template",
            json={"name": "From Fjord", "description": "What we sent Fjord"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 201, resp.text
        template = resp.json()
        data = template["data"]
        assert template["total_cents"] == proposal["total_cents"]
        assert [p["name"] for p in data["packages"]] == ["Essential", "Complete"]
        # Lines keep their packages (by the packages' new keys) and add-on state.
        keys = {p["name"]: p["key"] for p in data["packages"]}
        assert [(line["description"], line["package_key"]) for line in data["line_items"]][1:3] == [
            ("Five pages", keys["Essential"]),
            ("Ten pages", keys["Complete"]),
        ]
        assert data["line_items"][3]["optional"] is True
        assert data["valid_for_days"] >= 1
        assert data["deposit_percent"] == "25.000"
        assert [a["file_name"] for a in template["attachments"]] == ["terms.pdf"]

        # The template's data is accepted back as a new proposal as is.
        fresh = {k: v for k, v in data.items() if k != "valid_for_days"} | {"template_id": template["id"]}
        created = await client.post(f"/agencies/{agency.id}/proposals", json=fresh, headers=auth_headers(owner))
        assert created.status_code == 201, created.text
        assert created.json()["total_cents"] == proposal["total_cents"]

    async def test_deleted_services_and_questionnaires_drop_out(self, client, ctx) -> None:
        agency, owner = ctx
        headers = auth_headers(owner)
        service = (
            await client.post(
                f"/agencies/{agency.id}/services",
                json={"name": "Strategy", "pricing_type": "fixed", "unit_price_cents": 100},
                headers=headers,
            )
        ).json()
        kickoff = (
            await client.post(
                f"/agencies/{agency.id}/kickoff-templates",
                json={"name": "Kickoff", "questions": [{"type": "text", "label": "Launch date?"}]},
                headers=headers,
            )
        ).json()
        data = DATA | {
            "kickoff_template_id": kickoff["id"],
            "line_items": [
                {"description": "Strategy", "quantity": "1", "unit_price_cents": 100, "service_id": service["id"]}
            ],
            "packages": [],
        }
        template = await _template(client, agency, owner, data=data)
        assert template["data"]["line_items"][0]["service_id"] == service["id"]

        await client.delete(f"/agencies/{agency.id}/services/{service['id']}", headers=headers)
        await client.delete(f"/agencies/{agency.id}/kickoff-templates/{kickoff['id']}", headers=headers)
        read = (await client.get(f"{_base(agency)}/{template['id']}", headers=headers)).json()
        assert read["data"]["line_items"][0]["service_id"] is None
        assert read["data"]["kickoff_template_id"] is None
        # The line itself stays, and starting a proposal from it works.
        assert read["data"]["line_items"][0]["description"] == "Strategy"
        body = {k: v for k, v in read["data"].items() if k != "valid_for_days"} | {"template_id": template["id"]}
        created = await client.post(f"/agencies/{agency.id}/proposals", json=body, headers=headers)
        assert created.status_code == 201, created.text

    async def test_deleting_a_template_removes_its_files_but_not_proposals_made_from_it(
        self, client, ctx, fake_s3
    ) -> None:
        agency, owner = ctx
        headers = auth_headers(owner)
        template = await _template(client, agency, owner)
        await client.post(
            f"{_base(agency)}/{template['id']}/attachments",
            files={"file": ("sow.pdf", PDF, "application/pdf")},
            headers=headers,
        )
        body = {k: v for k, v in DATA.items() if k != "valid_for_days"} | {"template_id": template["id"]}
        proposal = (await client.post(f"/agencies/{agency.id}/proposals", json=body, headers=headers)).json()
        assert (await client.delete(f"{_base(agency)}/{template['id']}", headers=headers)).status_code == 204
        assert not [key for key in fake_s3.keys() if "/proposal-templates/" in key]
        still = (await client.get(f"/agencies/{agency.id}/proposals/{proposal['id']}", headers=headers)).json()
        assert len(still["attachments"]) == 1
