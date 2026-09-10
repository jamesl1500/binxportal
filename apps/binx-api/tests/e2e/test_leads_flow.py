"""End-to-end tests for the /agencies/{id}/leads router: the CRM CRUD, the
timeline, convert-to-client, the analyze stub, and the permission split.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from binx_api.modules.ai import client as ai_client
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.e2e


def _stub_json(monkeypatch: pytest.MonkeyPatch, payload: dict) -> None:
    monkeypatch.setattr(ai_client.settings, "anthropic_api_key", "sk-test-fake-key")
    usage = SimpleNamespace(
        input_tokens=200, output_tokens=50, cache_creation_input_tokens=0, cache_read_input_tokens=0
    )
    message = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=json.dumps(payload))], usage=usage, stop_reason="end_turn"
    )

    async def _call(**kwargs):
        return message

    monkeypatch.setattr(ai_client, "_call_anthropic", _call)


@pytest.fixture
async def agency_ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Mia Member")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    await add_agency_member(db_session, agency=agency, user=member)
    return agency, owner, member


class TestLeadCrud:
    async def test_create_work_and_list(self, client, agency_ctx) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)

        created = await client.post(
            f"/agencies/{agency.id}/leads",
            json={
                "name": "Northwind Prospect",
                "website": "https://northwind.example",
                "contact_email": "jo@nw.example",
            },
            headers=h,
        )
        assert created.status_code == 201, created.text
        lead_id = created.json()["id"]
        assert created.json()["status"] == "new"
        assert created.json()["owner_id"] is not None

        # a "created" event is on the timeline
        events = (await client.get(f"/agencies/{agency.id}/leads/{lead_id}/events", headers=h)).json()
        assert [e["kind"] for e in events] == ["created"]

        # add a note + change status
        await client.post(f"/agencies/{agency.id}/leads/{lead_id}/events", json={"body": "Left a voicemail"}, headers=h)
        status_res = await client.patch(
            f"/agencies/{agency.id}/leads/{lead_id}/status", json={"status": "qualified"}, headers=h
        )
        assert status_res.json()["status"] == "qualified"

        events = (await client.get(f"/agencies/{agency.id}/leads/{lead_id}/events", headers=h)).json()
        assert {e["kind"] for e in events} == {"created", "note", "status_changed"}

        listing = (await client.get(f"/agencies/{agency.id}/leads", headers=h)).json()
        assert [lead["name"] for lead in listing] == ["Northwind Prospect"]
        assert (await client.get(f"/agencies/{agency.id}/leads?status=new", headers=h)).json() == []

    async def test_analyze_stub_fills_score_and_summary(self, client, agency_ctx) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)
        lead_id = (
            await client.post(
                f"/agencies/{agency.id}/leads",
                json={"name": "Acme", "website": "https://acme.example", "contact_email": "x@acme.example"},
                headers=h,
            )
        ).json()["id"]

        analyzed = await client.post(f"/agencies/{agency.id}/leads/{lead_id}/analyze", headers=h)
        assert analyzed.status_code == 200
        body = analyzed.json()
        assert isinstance(body["score"], int) and body["score"] > 0
        assert body["ai_summary"] and body["ai_analyzed_at"]

    async def test_convert_creates_a_client(self, client, agency_ctx) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)
        lead_id = (
            await client.post(
                f"/agencies/{agency.id}/leads",
                json={"name": "Globex", "contact_name": "Hank", "website": "https://globex.example"},
                headers=h,
            )
        ).json()["id"]

        converted = await client.post(f"/agencies/{agency.id}/leads/{lead_id}/convert", headers=h)
        assert converted.status_code == 200, converted.text
        new_client_id = converted.json()["id"]
        assert converted.json()["name"] == "Globex"

        # the client now appears on the roster
        clients = (await client.get(f"/agencies/{agency.id}/clients", headers=h)).json()
        assert new_client_id in {c["id"] for c in clients}

        # the lead is won + points at the client, and can't be re-converted
        lead = (await client.get(f"/agencies/{agency.id}/leads/{lead_id}", headers=h)).json()
        assert lead["status"] == "won"
        assert lead["converted_client_id"] == new_client_id
        assert lead["converted_client_name"] == "Globex"
        again = await client.post(f"/agencies/{agency.id}/leads/{lead_id}/convert", headers=h)
        assert again.status_code == 409


class TestBulkAnalyze:
    async def test_analyze_all_open_leads(self, client, agency_ctx) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)
        for name in ("One", "Two"):
            await client.post(f"/agencies/{agency.id}/leads", json={"name": name}, headers=h)

        res = await client.post(f"/agencies/{agency.id}/leads/analyze", headers=h)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["analyzed"] == 2
        assert {lead["name"] for lead in body["leads"]} == {"One", "Two"}


class TestProspector:
    async def test_generate_then_import(self, client, agency_ctx, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, _member = agency_ctx
        h = auth_headers(owner)
        _stub_json(
            monkeypatch,
            {
                "candidates": [
                    {
                        "name": "Contoso Ltd",
                        "website": "https://contoso.example",
                        "rationale": "Scaling their content team.",
                        "estimated_value_cents": 600000,
                    }
                ]
            },
        )

        generated = await client.post(
            f"/agencies/{agency.id}/leads/generate",
            json={"industry": "software", "location": "Berlin", "count": 3},
            headers=h,
        )
        assert generated.status_code == 200, generated.text
        candidates = generated.json()["candidates"]
        assert candidates[0]["name"] == "Contoso Ltd"

        imported = await client.post(f"/agencies/{agency.id}/leads/import", json={"candidates": candidates}, headers=h)
        assert imported.status_code == 201, imported.text
        assert [lead["name"] for lead in imported.json()["imported"]] == ["Contoso Ltd"]
        assert imported.json()["imported"][0]["source"] == "ai_generated"

        # Re-importing the same candidate is deduped.
        again = await client.post(f"/agencies/{agency.id}/leads/import", json={"candidates": candidates}, headers=h)
        assert again.json()["imported"] == []
        assert len(again.json()["skipped"]) == 1


class TestPermissions:
    async def test_a_non_member_is_404(self, client, agency_ctx, db_session) -> None:
        agency, _owner, _member = agency_ctx
        stranger = await make_user(db_session, full_name="Stranger")
        r = await client.get(f"/agencies/{agency.id}/leads", headers=auth_headers(stranger))
        assert r.status_code == 404

    async def test_delete_is_owner_admin_only(self, client, agency_ctx, db_session) -> None:
        agency, owner, member = agency_ctx
        lead_id = (
            await client.post(f"/agencies/{agency.id}/leads", json={"name": "Temp"}, headers=auth_headers(owner))
        ).json()["id"]

        member_delete = await client.delete(f"/agencies/{agency.id}/leads/{lead_id}", headers=auth_headers(member))
        assert member_delete.status_code == 403

        owner_delete = await client.delete(f"/agencies/{agency.id}/leads/{lead_id}", headers=auth_headers(owner))
        assert owner_delete.status_code == 204
