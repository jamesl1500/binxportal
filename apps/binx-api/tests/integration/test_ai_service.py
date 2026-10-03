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
from binx_api.modules.ai.models import ACTION_APPLIED, ACTION_FAILED, ACTION_PENDING
from binx_api.modules.leads import places as places_client
from binx_api.modules.leads import service as leads_service
from binx_api.modules.messaging.models import SENDER_CLIENT
from binx_api.modules.messaging.service import post_message
from binx_api.modules.projects import service as projects_service
from tests.factories import add_agency_member, make_agency, make_conversation, make_invoice, make_project, make_user

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


def _capturing(*messages):
    """Like :func:`_sequenced`, but also records each call's kwargs."""
    calls: list[dict] = []
    remaining = list(messages)

    async def _call(**kwargs):
        calls.append(kwargs)
        assert remaining, "ran out of scripted responses"
        return remaining.pop(0)

    return _call, calls


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
        assert candidates[0].source == "web_search"  # default when unset by the model

    async def test_places_unconfigured_is_never_called(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        # google_places_api_key is unset by default — search_places should
        # short-circuit before ever reaching _call_places.
        called = False

        async def _call_places(**kwargs):
            nonlocal called
            called = True
            return {}

        monkeypatch.setattr(places_client, "_call_places", _call_places)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(json.dumps({"candidates": []}))))

        await ai_service.find_prospects(db_session, agency, actor=owner, brief={"industry": "retail"})
        assert called is False

    async def test_places_results_are_folded_into_the_prompt_and_tagged(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        monkeypatch.setattr(places_client.settings, "google_places_api_key", "test-places-key")
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        async def _call_places(**kwargs):
            return {
                "places": [
                    {
                        "displayName": {"text": "Riverside Cafe"},
                        "websiteUri": "https://riverside.example",
                        "formattedAddress": "1 River Rd, Austin, TX",
                    }
                ]
            }

        monkeypatch.setattr(places_client, "_call_places", _call_places)

        captured_prompts: list[str] = []

        async def _capture_anthropic(**kwargs):
            captured_prompts.append(kwargs["messages"][0]["content"])
            payload = json.dumps(
                {
                    "candidates": [
                        {
                            "name": "Riverside Cafe",
                            "website": "https://riverside.example",
                            "rationale": "x",
                            "source": "google_places",
                        }
                    ]
                }
            )
            return _text_message(payload)

        monkeypatch.setattr(ai_client, "_call_anthropic", _capture_anthropic)

        brief = {"industry": "cafes", "location": "Austin, TX", "radius_miles": 10, "count": 3}
        candidates = await ai_service.find_prospects(db_session, agency, actor=owner, brief=brief)

        assert "Riverside Cafe" in captured_prompts[0]
        assert "within 10 miles" in captured_prompts[0]
        assert candidates[0].source == "google_places"


class TestGenerateDrafts:
    async def test_dashboard_briefing_returns_model_text(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Here's your briefing.")))

        text = await ai_service.generate_dashboard_briefing(db_session, agency, owner)
        assert text == "Here's your briefing."


class TestDashboardBriefingCache:
    async def test_second_call_same_day_does_not_hit_the_model(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        # Only one scripted response — a second call to _call_anthropic would
        # raise "ran out of scripted responses", so this also proves the cache
        # hit skips the AI call entirely, not just that the text matches.
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Today's briefing.")))

        first = await ai_service.get_dashboard_briefing(db_session, agency, owner)
        second = await ai_service.get_dashboard_briefing(db_session, agency, owner)

        assert first == "Today's briefing."
        assert second == "Today's briefing."

    async def test_force_regenerates_and_overwrites_todays_row(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("First version.")))
        first = await ai_service.get_dashboard_briefing(db_session, agency, owner)
        assert first == "First version."

        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Refreshed version.")))
        refreshed = await ai_service.get_dashboard_briefing(db_session, agency, owner, force=True)
        assert refreshed == "Refreshed version."

        # A plain (non-forced) call afterward should see the refreshed row,
        # not fall back to the first one or call the model again.
        cached = await ai_service.get_dashboard_briefing(db_session, agency, owner)
        assert cached == "Refreshed version."

    async def test_briefing_is_scoped_per_user(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        other = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        monkeypatch.setattr(
            ai_client, "_call_anthropic", _sequenced(_text_message("For owner."), _text_message("For other."))
        )

        for_owner = await ai_service.get_dashboard_briefing(db_session, agency, owner)
        for_other = await ai_service.get_dashboard_briefing(db_session, agency, other)

        assert for_owner == "For owner."
        assert for_other == "For other."

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

    async def _lead(self, db, agency, actor, **overrides):
        fields = {
            "name": "Acme Co",
            "contact_name": None,
            "contact_email": "hi@acme.example",
            "contact_phone": None,
            "website": None,
            "source": "manual",
            "estimated_value_cents": None,
            "notes": None,
        }
        fields.update(overrides)
        return await leads_service.create_lead(db, agency, actor=actor, **fields)

    async def test_lead_followup_returns_model_text(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message("Just checking in!")))

        text = await ai_service.generate_lead_followup(db_session, lead, agency, actor=owner)
        assert text == "Just checking in!"

    async def test_lead_followup_rejects_a_closed_lead(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await self._lead(db_session, agency, owner)
        await leads_service.change_status(db_session, lead, new_status="won", lost_reason=None, actor=owner)

        with pytest.raises(Exception) as exc_info:
            await ai_service.generate_lead_followup(db_session, lead, agency, actor=owner)
        assert getattr(exc_info.value, "status_code", None) == 400


class TestGenerateMessageReply:
    async def test_rejects_an_empty_conversation(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await make_user(db_session, email="member@example.com")
        await add_agency_member(db_session, agency=agency, user=member)
        conversation = await make_conversation(db_session, agency=agency, creator=owner, others=[member])

        with pytest.raises(Exception) as exc_info:
            await ai_service.generate_message_reply(db_session, conversation, agency, actor=owner)
        assert getattr(exc_info.value, "status_code", None) == 400

    async def test_rejects_when_staff_already_has_the_last_word(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await make_user(db_session, email="member@example.com")
        await add_agency_member(db_session, agency=agency, user=member)
        conversation = await make_conversation(db_session, agency=agency, creator=owner, others=[member])
        client_user = await make_user(db_session, email="client@example.com")
        await post_message(
            db_session, conversation, sender=client_user, body="Any update?", uploads=[], sender_kind=SENDER_CLIENT
        )
        await post_message(db_session, conversation, sender=owner, body="On it!", uploads=[])

        with pytest.raises(Exception) as exc_info:
            await ai_service.generate_message_reply(db_session, conversation, agency, actor=owner)
        assert getattr(exc_info.value, "status_code", None) == 400

    async def test_drafts_a_reply_to_the_clients_latest_message(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        member = await make_user(db_session, email="member@example.com")
        await add_agency_member(db_session, agency=agency, user=member)
        conversation = await make_conversation(db_session, agency=agency, creator=owner, others=[member])
        client_user = await make_user(db_session, email="client@example.com")
        await post_message(db_session, conversation, sender=owner, body="Hi there", uploads=[])
        await post_message(
            db_session,
            conversation,
            sender=client_user,
            body="When will this be done?",
            uploads=[],
            sender_kind=SENDER_CLIENT,
        )

        captured: dict = {}

        async def _capture(**kwargs):
            captured.update(kwargs)
            return _text_message("We expect it done by Friday.")

        monkeypatch.setattr(ai_client, "_call_anthropic", _capture)

        text = await ai_service.generate_message_reply(db_session, conversation, agency, actor=owner)
        assert text == "We expect it done by Friday."
        prompt = captured["messages"][0]["content"]
        assert "When will this be done?" in prompt
        assert "Hi there" in prompt


class TestSuggestProjectTasks:
    async def test_parses_lists_and_tasks(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        project = await make_project(db_session, agency=agency, created_by=owner)

        payload = json.dumps(
            {
                "lists": [
                    {
                        "name": "Discovery",
                        "tasks": [
                            {"title": "Kickoff call", "description": "Align on scope and timeline."},
                            {"title": "Gather brand assets"},
                        ],
                    },
                    {"name": "Empty list dropped", "tasks": []},
                    {"name": "", "tasks": [{"title": "Dropped — no list name"}]},
                ]
            }
        )
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(payload)))

        suggestions = await ai_service.suggest_project_tasks(db_session, project, agency, actor=owner)
        assert [lst.name for lst in suggestions] == ["Discovery"]
        assert [t.title for t in suggestions[0].tasks] == ["Kickoff call", "Gather brand assets"]
        assert suggestions[0].tasks[0].description == "Align on scope and timeline."
        assert suggestions[0].tasks[1].description is None

    async def test_drops_tasks_with_no_title(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        project = await make_project(db_session, agency=agency, created_by=owner)

        payload = json.dumps({"lists": [{"name": "To Do", "tasks": [{"title": ""}, {"title": "Real task"}]}]})
        monkeypatch.setattr(ai_client, "_call_anthropic", _sequenced(_text_message(payload)))

        suggestions = await ai_service.suggest_project_tasks(db_session, project, agency, actor=owner)
        assert [t.title for t in suggestions[0].tasks] == ["Real task"]


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
        assert reply.content == "You have 1 lead matching 'acme': Acme Co."

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
        assert "wasn't able" in reply.content.lower() or "try narrowing" in reply.content.lower()


async def _acme_lead(db, agency, owner):
    return await leads_service.create_lead(
        db,
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


def _system_text(kwargs: dict) -> str:
    system = kwargs["system"]
    return system if isinstance(system, str) else "".join(block["text"] for block in system)


class TestAssistantActions:
    async def test_proposes_a_change_without_making_it_until_approved(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _acme_lead(db_session, agency, owner)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        call, calls = _capturing(
            _tool_use_message("update_lead_status", {"lead_id": str(lead.id), "status": "qualified"}),
            _text_message("I've proposed moving Acme Co to qualified."),
        )
        monkeypatch.setattr(ai_client, "_call_anthropic", call)

        reply = await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Mark Acme as qualified"
        )

        tool_names = {tool["name"] for tool in calls[0]["tools"]}
        assert {"search_leads", "update_lead_status", "create_task"} <= tool_names
        result_block = calls[1]["messages"][-1]["content"][0]
        assert json.loads(result_block["content"])["status"] == "awaiting_approval"

        actions = (await ai_service.list_conversation_actions(db_session, conversation.id))[reply.id]
        assert [(a.status, a.summary) for a in actions] == [
            (ACTION_PENDING, 'Move the lead "Acme Co" from new to qualified')
        ]
        await db_session.refresh(lead)
        assert lead.status == "new"  # nothing happened yet

        approved = await ai_service.approve_action(db_session, actions[0], agency, actor=owner)
        assert approved.status == ACTION_APPLIED
        assert approved.result == 'Moved "Acme Co" to qualified.'
        await db_session.refresh(lead)
        assert lead.status == "qualified"

    async def test_applies_immediately_when_the_member_turned_confirmations_off(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        project = await make_project(db_session, agency=agency, created_by=owner)
        await ai_service.update_preferences(db_session, agency.id, owner.id, confirm_actions=False)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            _sequenced(
                _tool_use_message(
                    "create_task",
                    {"project_id": str(project.id), "title": "Draft homepage copy", "due_date": "2026-10-15"},
                ),
                _text_message("Added it to To Do."),
            ),
        )
        reply = await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Add a task to draft homepage copy"
        )

        [action] = (await ai_service.list_conversation_actions(db_session, conversation.id))[reply.id]
        assert action.status == ACTION_APPLIED
        assert action.summary == 'Add the task "Draft homepage copy" to Website Redesign › To Do, due 2026-10-15'
        board = await projects_service.get_project_board(db_session, project.id)
        assert [task.title for task, *_rest in board[0][1]] == ["Draft homepage copy"]

    async def test_a_bad_call_goes_back_to_claude_as_an_error_and_records_nothing(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        call, calls = _capturing(
            _tool_use_message("update_lead_status", {"lead_id": "Acme Co", "status": "won"}),
            _text_message("I couldn't find that lead."),
        )
        monkeypatch.setattr(ai_client, "_call_anthropic", call)
        await ai_service.assistant_reply(db_session, conversation, agency, actor=owner, user_message="Acme won!")

        result_block = calls[1]["messages"][-1]["content"][0]
        assert result_block["is_error"] is True
        assert "lead_id must be an id" in result_block["content"]
        assert await ai_service.list_conversation_actions(db_session, conversation.id) == {}

    async def test_action_tools_are_withheld_when_the_member_turned_changes_off(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await ai_service.update_preferences(
            db_session,
            agency.id,
            owner.id,
            allow_actions=False,
            response_length="concise",
            custom_instructions="Always answer in British English.",
        )
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)

        call, calls = _capturing(_text_message("I can't make changes — that's turned off."))
        monkeypatch.setattr(ai_client, "_call_anthropic", call)
        await ai_service.assistant_reply(db_session, conversation, agency, actor=owner, user_message="Create a lead")

        tool_names = {tool["name"] for tool in calls[0]["tools"]}
        assert "create_lead" not in tool_names
        assert "search_leads" in tool_names
        assert "read-only" in _system_text(calls[0])
        assert "Always answer in British English." in _system_text(calls[0])
        assert calls[0]["max_tokens"] == 800

    async def test_approving_a_stale_proposal_fails_onto_the_card(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _acme_lead(db_session, agency, owner)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)
        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            _sequenced(
                _tool_use_message("add_lead_note", {"lead_id": str(lead.id), "body": "Called, left a voicemail."}),
                _text_message("Proposed a note."),
            ),
        )
        reply = await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Note that I called Acme"
        )
        [action] = (await ai_service.list_conversation_actions(db_session, conversation.id))[reply.id]

        await leads_service.delete_lead(db_session, lead)
        approved = await ai_service.approve_action(db_session, action, agency, actor=owner)
        assert approved.status == ACTION_FAILED
        assert approved.result == "Lead not found"

    async def test_later_turns_see_what_became_of_earlier_changes(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lead = await _acme_lead(db_session, agency, owner)
        conversation = await ai_service.create_conversation(db_session, agency.id, owner.id)
        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            _sequenced(
                _tool_use_message("update_lead_status", {"lead_id": str(lead.id), "status": "won"}),
                _text_message("Proposed."),
            ),
        )
        reply = await ai_service.assistant_reply(db_session, conversation, agency, actor=owner, user_message="Acme won")
        [action] = (await ai_service.list_conversation_actions(db_session, conversation.id))[reply.id]
        await ai_service.decline_action(db_session, action)

        call, calls = _capturing(_text_message("Noted."))
        monkeypatch.setattr(ai_client, "_call_anthropic", call)
        await ai_service.assistant_reply(
            db_session, conversation, agency, actor=owner, user_message="Did it go through?"
        )

        previous_reply = calls[0]["messages"][1]
        assert previous_reply["role"] == "assistant"
        assert 'Move the lead "Acme Co" from new to won (declined by the member)' in previous_reply["content"]
