"""Integration tests for ``binx_api.modules.ai.service`` — the lead-analysis
prompt/parse round-trip and the "Ask AI" assistant's manual tool-calling loop.

``ai/client.py::_call_anthropic`` is monkeypatched throughout — nothing here
makes a real network call.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from binx_api.modules.ai import client as ai_client
from binx_api.modules.ai import service as ai_service
from binx_api.modules.leads import service as leads_service
from tests.factories import make_agency, make_invoice, make_project, make_user

pytestmark = pytest.mark.integration


def _configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_client.settings, "anthropic_api_key", "sk-test-fake-key")


def _fake_usage() -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=500, output_tokens=100, cache_creation_input_tokens=0, cache_read_input_tokens=0
    )


def _text_message(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)], usage=_fake_usage(), stop_reason="end_turn"
    )


def _tool_use_message(tool_name: str, tool_input: dict, tool_use_id: str = "toolu_1") -> SimpleNamespace:
    block = SimpleNamespace(type="tool_use", id=tool_use_id, name=tool_name, input=tool_input)
    return SimpleNamespace(content=[block], usage=_fake_usage(), stop_reason="tool_use")


def _sequenced(*messages):
    """Returns each of ``messages`` in turn on successive calls, async."""
    remaining = list(messages)

    async def _call(**kwargs):
        assert remaining, "ran out of scripted responses"
        return remaining.pop(0)

    return _call


class TestAnalyzeLeadWebsite:
    async def _lead(self, db, agency, actor):
        return await leads_service.create_lead(
            db,
            agency,
            actor=actor,
            name="Acme Co",
            contact_name=None,
            contact_email="hi@acme.example",
            contact_phone=None,
            website="https://acme.example",
            source="manual",
            estimated_value_cents=None,
            notes=None,
        )

    async def test_parses_a_well_formed_response(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)

        payload = json.dumps(
            {
                "score": 87,
                "fit": "strong",
                "summary": "Strong fit, clear budget signal.",
                "talking_points": ["Recent funding round", "Hiring for marketing"],
                "next_step": "Book a discovery call.",
            }
        )
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(payload)))

        analysis = await ai_service.analyze_lead_website(db_session, lead, agency, actor=owner)
        assert analysis.score == 87
        assert analysis.fit == "strong"
        assert "Strong fit" in analysis.summary
        assert analysis.talking_points == ["Recent funding round", "Hiring for marketing"]
        assert analysis.next_step == "Book a discovery call."

    async def test_clamps_an_out_of_range_score(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)

        payload = json.dumps({"score": 250, "fit": "strong", "summary": "x", "talking_points": [], "next_step": ""})
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(payload)))

        analysis = await ai_service.analyze_lead_website(db_session, lead, agency, actor=owner)
        assert analysis.score == 100

    async def test_malformed_response_raises(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)

        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("not json at all")))

        with pytest.raises(Exception):  # noqa: B017 - json.JSONDecodeError, deliberately not caught here
            await ai_service.analyze_lead_website(db_session, lead, agency, actor=owner)

    async def test_leads_service_falls_back_to_heuristic_on_ai_failure(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Unconfigured (the autouse default) -> analyze_lead_website raises
        # AiNotConfigured -> leads/service.py::analyze_lead falls back.
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)

        analyzed = await leads_service.analyze_lead(db_session, lead, actor=owner)
        assert analyzed.score is not None
        assert "Heuristic read of" in analyzed.ai_summary


class TestFindProspects:
    async def test_parses_candidates_and_clamps_count(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        payload = json.dumps(
            {
                "candidates": [
                    {
                        "name": "Northwind Traders",
                        "website": "https://northwind.example",
                        "contact_email": "hi@northwind.example",
                        "estimated_value_cents": 750000,
                        "rationale": "Recently rebranded, likely needs marketing help.",
                    },
                    {"name": "", "rationale": "dropped — no name"},
                ]
            }
        )
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(payload)))

        brief = {"industry": "retail", "location": "US", "count": 3}
        candidates = await ai_service.find_prospects(db_session, agency, actor=owner, brief=brief)
        assert [c.name for c in candidates] == ["Northwind Traders"]
        assert candidates[0].estimated_value_cents == 750000
        assert candidates[0].website == "https://northwind.example"


class TestGenerateDrafts:
    async def test_dashboard_briefing_returns_model_text(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Here's your briefing.")))

        text = await ai_service.generate_dashboard_briefing(db_session, agency, owner)
        assert text == "Here's your briefing."

    async def test_project_summary_returns_model_text(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        project = await make_project(db_session, agency=agency, created_by=owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Great progress this week.")))

        text = await ai_service.generate_project_summary(db_session, project, agency, actor=owner)
        assert text == "Great progress this week."

    async def test_invoice_reminder_rejects_a_draft_invoice(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        invoice = await make_invoice(db_session, agency=agency, created_by=owner)  # still draft

        with pytest.raises(Exception) as exc_info:
            await ai_service.generate_invoice_reminder(db_session, invoice, agency, actor=owner)
        assert getattr(exc_info.value, "status_code", None) == 400


class TestAssistantReply:
    async def test_executes_a_tool_and_persists_only_the_final_turn(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await leads_service.create_lead(
            db_session,
            agency,
            actor=owner,
            name="Acme Co",
            contact_name=None,
            contact_email=None,
            contact_phone=None,
            website=None,
            source="manual",
            estimated_value_cents=None,
            notes=None,
        )
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            _sequenced(
                _tool_use_message("search_leads", {"query": "acme"}),
                _text_message("You have 1 lead matching 'acme': Acme Co."),
            ),
        )

        reply = await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Do we have any leads named acme?"
        )
        assert reply == "You have 1 lead matching 'acme': Acme Co."

        messages = await ai_service.list_conversation_messages(db_session, conversation.id)
        assert [(m.role, m.content) for m in messages] == [
            ("user", "Do we have any leads named acme?"),
            ("assistant", "You have 1 lead matching 'acme': Acme Co."),
        ]

        await db_session.refresh(conversation)
        assert conversation.title == "Do we have any leads named acme?"

    async def test_gives_up_after_max_iterations_without_crashing(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        # Always asks for another tool call — never reaches end_turn.
        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            _sequenced(*[_tool_use_message("search_leads", {}) for _ in range(ai_service.MAX_ASSISTANT_ITERATIONS)]),
        )

        reply = await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Keep digging"
        )
        assert "wasn't able" in reply.lower() or "try narrowing" in reply.lower()
