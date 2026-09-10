"""Integration tests for ``binx_api.modules.leads.service`` — the lead
lifecycle (create → work → convert), the event timeline, and the analyze stub.
"""

from __future__ import annotations

import dataclasses

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.agencies.models import AgencyClient
from binx_api.modules.billing import models as billing_models
from binx_api.modules.leads import service
from binx_api.modules.leads.models import Lead
from tests.factories import add_agency_member, make_agency, make_user

pytestmark = pytest.mark.integration


async def _lead(db, agency, actor, **overrides):
    fields = {
        "name": "Northwind Prospect",
        "contact_name": None,
        "contact_email": "hi@northwind.example",
        "contact_phone": None,
        "website": "https://northwind.example",
        "source": "manual",
        "estimated_value_cents": None,
        "notes": None,
    }
    fields.update(overrides)
    return await service.create_lead(db, agency, actor=actor, **fields)


class TestLifecycle:
    async def test_create_records_a_created_event_and_owner(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner)

        assert lead.owner_id == owner.id
        assert lead.status == "new"
        assert lead.last_activity_at is not None

        events = await service.list_events(db_session, lead.id)
        assert [e.kind for e in events] == ["created"]

    async def test_status_change_appends_an_event(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner)

        await service.change_status(db_session, lead, new_status="qualified", lost_reason=None, actor=owner)
        await service.change_status(
            db_session, lead, new_status="lost", lost_reason="Went with a competitor", actor=owner
        )

        await db_session.refresh(lead)
        assert lead.status == "lost"
        assert lead.lost_reason == "Went with a competitor"
        kinds = [e.kind for e in await service.list_events(db_session, lead.id)]
        assert kinds.count("status_changed") == 2

    async def test_assign_owner_validates_membership_and_notifies(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        outsider = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)
        lead = await _lead(db_session, agency, owner)

        with pytest.raises(HTTPException) as exc:
            await service.assign_owner(db_session, lead, agency.id, owner_id=outsider.id, actor=owner)
        assert exc.value.status_code == 400

        await service.assign_owner(db_session, lead, agency.id, owner_id=teammate.id, actor=owner)
        await db_session.refresh(lead)
        assert lead.owner_id == teammate.id

    async def test_add_note(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner)

        event = await service.add_note(db_session, lead, body="  Left a voicemail  ", actor=owner)
        assert event.kind == "note"
        assert event.body == "Left a voicemail"
        assert event.actor_name == owner.full_name


class TestConvert:
    async def test_convert_creates_a_client_and_wins_the_lead(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner, contact_name="Nancy", notes="warm intro")

        client = await service.convert_lead(db_session, lead, agency, actor=owner)

        assert isinstance(client, AgencyClient)
        assert client.name == "Northwind Prospect"
        assert client.primary_contact_name == "Nancy"
        assert client.website == "https://northwind.example"
        assert client.notes == "warm intro"

        await db_session.refresh(lead)
        assert lead.status == "won"
        assert lead.converted_client_id == client.id
        assert lead.converted_at is not None
        assert "converted" in [e.kind for e in await service.list_events(db_session, lead.id)]

    async def test_cannot_convert_twice(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner)
        await service.convert_lead(db_session, lead, agency, actor=owner)

        with pytest.raises(HTTPException) as exc:
            await service.convert_lead(db_session, lead, agency, actor=owner)
        assert exc.value.status_code == 409


class TestAnalyzeStub:
    async def test_scores_and_summarises_with_structured_fields(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(
            db_session, agency, owner, contact_phone="+1-555-0100", estimated_value_cents=500000, notes="promising"
        )
        await service.change_status(db_session, lead, new_status="qualified", lost_reason=None, actor=owner)

        analyzed = await service.analyze_lead(db_session, lead, actor=owner)
        assert analyzed.score == 100  # website+email+phone+value+worked+notes
        assert analyzed.ai_summary and "northwind.example" in analyzed.ai_summary
        # Talking points / next step / fit now land in their own columns, not
        # jammed into the summary blob.
        assert analyzed.ai_next_step
        assert analyzed.ai_fit == "strong"
        assert analyzed.ai_analyzed_at is not None
        assert "analyzed" in [e.kind for e in await service.list_events(db_session, lead.id)]

    async def test_sparse_lead_skips_straight_to_heuristic(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _lead(db_session, agency, owner, contact_email=None, website=None)

        analyzed = await service.analyze_lead(db_session, lead, actor=owner)
        assert analyzed.score is not None
        assert "Heuristic read of" in analyzed.ai_summary


class TestPlanLimit:
    async def test_lead_cap_blocks_at_the_plan_limit(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(
            billing_models.PLANS, "free", dataclasses.replace(billing_models.PLANS["free"], max_leads=2)
        )
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await _lead(db_session, agency, owner, name="A")
        await _lead(db_session, agency, owner, name="B")

        with pytest.raises(HTTPException) as exc:
            await _lead(db_session, agency, owner, name="C")
        assert exc.value.status_code == 402


class TestBulkAnalyze:
    async def test_analyzes_unanalyzed_open_leads_only(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        open_lead = await _lead(db_session, agency, owner, name="Open")
        done_lead = await _lead(db_session, agency, owner, name="Done")
        await service.analyze_lead(db_session, done_lead, actor=owner)
        won_lead = await _lead(db_session, agency, owner, name="Won")
        await service.change_status(db_session, won_lead, new_status="won", lost_reason=None, actor=owner)

        result = await service.analyze_open_leads(db_session, agency, actor=owner)
        assert result.analyzed == 1
        assert [lead.name for lead in result.leads] == ["Open"]
        await db_session.refresh(open_lead)
        assert open_lead.ai_analyzed_at is not None


class TestImportProspects:
    async def test_creates_leads_and_dedupes(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await _lead(db_session, agency, owner, name="Existing Co", website="https://existing.example")

        candidates = [
            {"name": "Fresh Co", "website": "https://fresh.example", "rationale": "Growing fast"},
            {"name": "Existing Co", "website": None},  # dup by name
            {"name": "Other", "website": "https://www.existing.example/about"},  # dup by host
        ]
        result = await service.import_prospects(db_session, agency, actor=owner, candidates=candidates)

        assert [lead.name for lead in result.imported] == ["Fresh Co"]
        assert len(result.skipped) == 2
        assert result.imported[0].source == "ai_generated"
        assert "Growing fast" in (result.imported[0].notes or "")


class TestListFilters:
    async def test_filters_by_status_owner_and_source(self, db_session) -> None:
        owner = await make_user(db_session)
        teammate = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)

        a = await _lead(db_session, agency, owner, name="A", source="referral")
        b = await _lead(db_session, agency, owner, name="B", source="manual")
        await service.change_status(db_session, b, new_status="qualified", lost_reason=None, actor=owner)
        await service.assign_owner(db_session, a, agency.id, owner_id=teammate.id, actor=owner)

        by_status = await service.list_leads(db_session, agency.id, status_filter="qualified")
        assert [lead.name for lead, *_ in by_status] == ["B"]

        by_owner = await service.list_leads(db_session, agency.id, owner_id=teammate.id)
        assert [lead.name for lead, *_ in by_owner] == ["A"]

        by_source = await service.list_leads(db_session, agency.id, source="referral")
        assert [lead.name for lead, *_ in by_source] == ["A"]

        # sanity: the raw rows carry the joined owner name
        rows = await service.list_leads(db_session, agency.id, owner_id=teammate.id)
        assert rows[0][1] == teammate.full_name
        assert (await db_session.execute(select(Lead))).scalars().all()
