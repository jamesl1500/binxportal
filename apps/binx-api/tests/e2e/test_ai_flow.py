"""End-to-end tests for the AI surfaces: /agencies/{id}/ai/* (settings, usage,
briefing, the "Ask AI" conversation endpoints) plus the project-summary and
invoice-reminder routes that ride projects/router.py and invoicing/router.py.

``_call_anthropic`` is monkeypatched wherever a test needs the "configured"
path — nothing here makes a real network call.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from binx_api.modules.agencies.models import ROLE_MEMBER, AgencyMember
from binx_api.modules.ai import client as ai_client
from binx_api.modules.leads.models import Lead
from binx_api.modules.messaging.models import SENDER_CLIENT
from binx_api.modules.messaging.service import create_conversation, post_message
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_invoice, make_project, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def team(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Mia Member")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    db_session.add(AgencyMember(agency_id=agency.id, user_id=member.id, role=ROLE_MEMBER))
    await db_session.commit()
    return agency, owner, member


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


def _stub_reply(monkeypatch: pytest.MonkeyPatch, text: str) -> None:
    async def _call(**kwargs):
        return _text_message(text)

    monkeypatch.setattr(ai_client, "_call_anthropic", _call)


class TestSettings:
    async def test_member_can_view_but_not_edit(self, client, team) -> None:
        agency, _owner, member = team
        h = auth_headers(member)

        got = await client.get(f"/agencies/{agency.id}/ai/settings", headers=h)
        assert got.status_code == 200, got.text
        body = got.json()
        assert body["is_enabled"] is True
        # A new agency is on the Free plan, so the AI settings seed from — and
        # are capped at — that tier's ceilings.
        assert body["monthly_budget_cents"] == 1000
        assert body["daily_user_request_cap"] == 15
        assert body["plan_monthly_budget_cents"] == 1000
        assert body["configured"] is False  # key unset by the autouse fixture

        forbidden = await client.patch(
            f"/agencies/{agency.id}/ai/settings",
            json={"is_enabled": True, "monthly_budget_cents": 5000, "daily_user_request_cap": 10},
            headers=h,
        )
        assert forbidden.status_code == 403

    async def test_owner_can_edit_but_not_above_the_plan_ceiling(self, client, team) -> None:
        agency, owner, _member = team
        h = auth_headers(owner)

        # 999 is under the Free ceiling (1000) so it sticks; the daily cap of
        # 30 is above the Free ceiling (15) so it's clamped.
        updated = await client.patch(
            f"/agencies/{agency.id}/ai/settings",
            json={"is_enabled": False, "monthly_budget_cents": 999, "daily_user_request_cap": 30},
            headers=h,
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert body["is_enabled"] is False
        assert body["monthly_budget_cents"] == 999
        assert body["daily_user_request_cap"] == 15

        got = await client.get(f"/agencies/{agency.id}/ai/settings", headers=h)
        assert got.json()["monthly_budget_cents"] == 999


class TestUsage:
    async def test_shape_with_no_usage_yet(self, client, team) -> None:
        agency, owner, _member = team
        got = await client.get(f"/agencies/{agency.id}/ai/usage", headers=auth_headers(owner))
        assert got.status_code == 200, got.text
        body = got.json()
        assert body["configured"] is False
        assert body["month_spent_cents"] == 0
        assert body["today_request_count"] == 0
        assert body["recent_events"] == []


class TestBriefing:
    async def test_returns_503_when_not_configured(self, client, team) -> None:
        agency, owner, _member = team
        got = await client.get(f"/agencies/{agency.id}/ai/briefing", headers=auth_headers(owner))
        assert got.status_code == 503

    async def test_returns_the_model_text_when_configured(self, client, team, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        _stub_reply(monkeypatch, "You have 2 overdue invoices and 1 task due soon.")

        got = await client.get(f"/agencies/{agency.id}/ai/briefing", headers=auth_headers(owner))
        assert got.status_code == 200, got.text
        assert got.json() == {"briefing": "You have 2 overdue invoices and 1 task due soon."}

        # And it was logged as a real, ok-status usage event on the /usage panel.
        usage = (await client.get(f"/agencies/{agency.id}/ai/usage", headers=auth_headers(owner))).json()
        assert usage["recent_events"][0]["feature"] == "dashboard_briefing"
        assert usage["recent_events"][0]["status"] == "ok"

    async def test_a_second_load_the_same_day_is_served_from_cache(
        self, client, team, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, _member = team
        h = auth_headers(owner)
        _configure(monkeypatch)
        _stub_reply(monkeypatch, "First look at today.")

        first = await client.get(f"/agencies/{agency.id}/ai/briefing", headers=h)
        assert first.json() == {"briefing": "First look at today."}

        # The stub would happily answer again, but a plain GET shouldn't ask
        # it to — same text back, and no second usage event logged.
        _stub_reply(monkeypatch, "This should never be returned.")
        second = await client.get(f"/agencies/{agency.id}/ai/briefing", headers=h)
        assert second.json() == {"briefing": "First look at today."}

        usage = (await client.get(f"/agencies/{agency.id}/ai/usage", headers=h)).json()
        assert usage["today_request_count"] == 1

    async def test_refresh_query_param_regenerates(self, client, team, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, _member = team
        h = auth_headers(owner)
        _configure(monkeypatch)
        _stub_reply(monkeypatch, "First look at today.")
        await client.get(f"/agencies/{agency.id}/ai/briefing", headers=h)

        _stub_reply(monkeypatch, "Refreshed.")
        refreshed = await client.get(f"/agencies/{agency.id}/ai/briefing?refresh=true", headers=h)
        assert refreshed.json() == {"briefing": "Refreshed."}

        usage = (await client.get(f"/agencies/{agency.id}/ai/usage", headers=h)).json()
        assert usage["today_request_count"] == 2


class TestConversations:
    async def test_full_thread_lifecycle(self, client, team, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, member = team
        _configure(monkeypatch)
        h = auth_headers(owner)

        created = await client.post(f"/agencies/{agency.id}/ai/conversations", headers=h)
        assert created.status_code == 201, created.text
        conversation_id = created.json()["id"]
        assert created.json()["title"] is None

        _stub_reply(monkeypatch, "You have no overdue invoices right now.")
        sent = await client.post(
            f"/agencies/{agency.id}/ai/conversations/{conversation_id}/messages",
            json={"message": "Any overdue invoices?"},
            headers=h,
        )
        assert sent.status_code == 201, sent.text
        assert sent.json()["role"] == "assistant"
        assert sent.json()["content"] == "You have no overdue invoices right now."

        messages = (
            await client.get(f"/agencies/{agency.id}/ai/conversations/{conversation_id}/messages", headers=h)
        ).json()
        assert [(m["role"], m["content"]) for m in messages] == [
            ("user", "Any overdue invoices?"),
            ("assistant", "You have no overdue invoices right now."),
        ]

        listed = (await client.get(f"/agencies/{agency.id}/ai/conversations", headers=h)).json()
        assert listed[0]["id"] == conversation_id
        assert listed[0]["title"] == "Any overdue invoices?"

        # Another member of the same agency can't see or touch someone else's thread.
        other = auth_headers(member)
        assert (
            await client.get(f"/agencies/{agency.id}/ai/conversations/{conversation_id}/messages", headers=other)
        ).status_code == 404
        assert (
            await client.delete(f"/agencies/{agency.id}/ai/conversations/{conversation_id}", headers=other)
        ).status_code == 404

        deleted = await client.delete(f"/agencies/{agency.id}/ai/conversations/{conversation_id}", headers=h)
        assert deleted.status_code == 204
        assert (await client.get(f"/agencies/{agency.id}/ai/conversations", headers=h)).json() == []


class TestProjectSummaryAndInvoiceReminder:
    async def test_project_summary_draft(self, client, team, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        project = await make_project(db_session, agency=agency, created_by=owner)
        _stub_reply(monkeypatch, "The redesign is on track, wireframes are done.")

        got = await client.post(f"/agencies/{agency.id}/projects/{project.id}/ai/summary", headers=auth_headers(owner))
        assert got.status_code == 200, got.text
        assert got.json() == {"draft": "The redesign is on track, wireframes are done."}

    async def test_invoice_reminder_requires_a_sent_invoice(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        agency_client = await make_client(db_session, agency=agency)
        invoice = await make_invoice(db_session, agency=agency, created_by=owner, client=agency_client)  # draft

        rejected = await client.post(
            f"/agencies/{agency.id}/invoices/{invoice.id}/ai/reminder", headers=auth_headers(owner)
        )
        assert rejected.status_code == 400

        issued = await client.post(
            f"/agencies/{agency.id}/invoices/{invoice.id}/issue",
            json={"send_notice": False},
            headers=auth_headers(owner),
        )
        assert issued.status_code == 200

        _stub_reply(monkeypatch, "Just a friendly reminder that this invoice is due.")
        drafted = await client.post(
            f"/agencies/{agency.id}/invoices/{invoice.id}/ai/reminder", headers=auth_headers(owner)
        )
        assert drafted.status_code == 200, drafted.text
        assert drafted.json() == {"draft": "Just a friendly reminder that this invoice is due."}


class TestProjectTaskSuggestions:
    async def test_suggest_then_apply_appends_to_the_board(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        project = await make_project(db_session, agency=agency, created_by=owner)

        payload = (
            '{"lists": [{"name": "Discovery", "tasks": ['
            '{"title": "Kickoff call", "description": "Align on scope."}, '
            '{"title": "Gather assets"}]}]}'
        )
        _stub_reply(monkeypatch, payload)

        suggested = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/ai/tasks", headers=auth_headers(owner)
        )
        assert suggested.status_code == 200, suggested.text
        body = suggested.json()
        assert body == {
            "lists": [
                {
                    "name": "Discovery",
                    "tasks": [
                        {"title": "Kickoff call", "description": "Align on scope."},
                        {"title": "Gather assets", "description": None},
                    ],
                }
            ]
        }

        applied = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/ai/tasks/apply", json=body, headers=auth_headers(owner)
        )
        assert applied.status_code == 204, applied.text

        board = await client.get(f"/agencies/{agency.id}/projects/{project.id}/board", headers=auth_headers(owner))
        assert board.status_code == 200, board.text
        list_names = [lst["name"] for lst in board.json()]
        assert list_names[-1] == "Discovery"
        assert [t["title"] for t in board.json()[-1]["tasks"]] == ["Kickoff call", "Gather assets"]


class TestLeadFollowup:
    async def test_rejects_a_closed_lead_then_drafts_for_an_open_one(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        created = await client.post(
            f"/agencies/{agency.id}/leads", json={"name": "Acme Co", "source": "manual"}, headers=auth_headers(owner)
        )
        assert created.status_code == 201, created.text
        lead_id = created.json()["id"]

        closed = await client.patch(
            f"/agencies/{agency.id}/leads/{lead_id}/status",
            json={"status": "lost", "lost_reason": "Went with a competitor"},
            headers=auth_headers(owner),
        )
        assert closed.status_code == 200, closed.text

        rejected = await client.post(f"/agencies/{agency.id}/leads/{lead_id}/ai/follow-up", headers=auth_headers(owner))
        assert rejected.status_code == 400

        reopened = await client.patch(
            f"/agencies/{agency.id}/leads/{lead_id}/status",
            json={"status": "contacted", "lost_reason": None},
            headers=auth_headers(owner),
        )
        assert reopened.status_code == 200, reopened.text

        _stub_reply(monkeypatch, "Just checking in on your project timeline!")
        drafted = await client.post(f"/agencies/{agency.id}/leads/{lead_id}/ai/follow-up", headers=auth_headers(owner))
        assert drafted.status_code == 200, drafted.text
        assert drafted.json() == {"draft": "Just checking in on your project timeline!"}


class TestMessageReplyDraft:
    async def test_rejects_then_drafts_once_a_client_message_is_the_latest(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, member = team
        _configure(monkeypatch)
        conversation = await create_conversation(
            db_session,
            agency,
            creator=owner,
            kind="group",
            title="Rebrand chat",
            participant_user_ids=[member.id],
            client_id=None,
            project_id=None,
            initial_message=None,
        )

        rejected = await client.post(
            f"/agencies/{agency.id}/conversations/{conversation.id}/ai/draft-reply", headers=auth_headers(owner)
        )
        assert rejected.status_code == 400

        client_user = await make_user(db_session, email="client@example.com")
        await post_message(
            db_session,
            conversation,
            sender=client_user,
            body="When will this be done?",
            uploads=[],
            sender_kind=SENDER_CLIENT,
        )

        _stub_reply(monkeypatch, "We expect it done by Friday.")
        drafted = await client.post(
            f"/agencies/{agency.id}/conversations/{conversation.id}/ai/draft-reply", headers=auth_headers(owner)
        )
        assert drafted.status_code == 200, drafted.text
        assert drafted.json() == {"draft": "We expect it done by Friday."}


def _tool_use_message(tool_name: str, tool_input: dict) -> SimpleNamespace:
    block = SimpleNamespace(type="tool_use", id="toolu_1", name=tool_name, input=tool_input)
    return SimpleNamespace(content=[block], usage=_fake_usage(), stop_reason="tool_use")


def _stub_stream(monkeypatch: pytest.MonkeyPatch, *messages: SimpleNamespace) -> None:
    """Scripts ``complete_stream``: each call streams the next message's text
    as deltas, then completes with it."""
    remaining = list(messages)

    async def _stream(*args, **kwargs):
        message = remaining.pop(0)
        for block in message.content:
            if block.type == "text":
                yield ai_client.TextDelta(text=block.text)
        yield ai_client.TurnComplete(message=message)

    monkeypatch.setattr(ai_client, "complete_stream", _stream)


def _sse_events(body: str) -> list[dict]:
    return [json.loads(chunk.removeprefix("data: ")) for chunk in body.split("\n\n") if chunk.startswith("data: ")]


class TestPreferences:
    async def test_defaults_then_save_scoped_to_the_member(self, client, team) -> None:
        agency, owner, member = team
        h = auth_headers(owner)
        url = f"/agencies/{agency.id}/ai/preferences"

        defaults = (await client.get(url, headers=h)).json()
        assert defaults == {
            "response_length": "balanced",
            "tone": "professional",
            "allow_actions": True,
            "confirm_actions": True,
            "voice_auto_send": True,
            "custom_instructions": None,
        }

        saved = await client.put(
            url,
            json={
                **defaults,
                "response_length": "concise",
                "tone": "casual",
                "confirm_actions": False,
                "custom_instructions": "  Use bullet points.  ",
            },
            headers=h,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["custom_instructions"] == "Use bullet points."
        assert (await client.get(url, headers=h)).json()["tone"] == "casual"

        # Someone else's preferences are untouched.
        assert (await client.get(url, headers=auth_headers(member))).json() == defaults

    async def test_rejects_an_unknown_choice(self, client, team) -> None:
        agency, owner, _member = team
        response = await client.put(
            f"/agencies/{agency.id}/ai/preferences",
            json={
                "response_length": "epic",
                "tone": "professional",
                "allow_actions": True,
                "confirm_actions": True,
                "voice_auto_send": True,
            },
            headers=auth_headers(owner),
        )
        assert response.status_code == 422


class TestActions:
    async def test_stream_proposes_then_approve_applies_once(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, member = team
        _configure(monkeypatch)
        h = auth_headers(owner)
        lead = Lead(agency_id=agency.id, name="Acme Co")
        db_session.add(lead)
        await db_session.commit()
        conversation_id = (await client.post(f"/agencies/{agency.id}/ai/conversations", headers=h)).json()["id"]
        base = f"/agencies/{agency.id}/ai/conversations/{conversation_id}"

        _stub_stream(
            monkeypatch,
            _tool_use_message("update_lead_status", {"lead_id": str(lead.id), "status": "won"}),
            _text_message("I've proposed marking Acme Co as won."),
        )
        streamed = await client.post(f"{base}/messages/stream", json={"message": "Acme signed!"}, headers=h)
        events = _sse_events(streamed.text)
        assert [e["type"] for e in events] == ["action", "delta", "done"]
        action = events[0]["action"]
        assert action["status"] == "pending"
        assert action["summary"] == 'Move the lead "Acme Co" from new to won'

        messages = (await client.get(f"{base}/messages", headers=h)).json()
        assert messages[1]["actions"][0]["id"] == action["id"]
        assert messages[0]["actions"] == []

        # Only the conversation's own member can act on it.
        assert (
            await client.post(f"{base}/actions/{action['id']}/approve", headers=auth_headers(member))
        ).status_code == 404

        approved = await client.post(f"{base}/actions/{action['id']}/approve", headers=h)
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "applied"
        await db_session.refresh(lead)
        assert lead.status == "won"

        again = await client.post(f"{base}/actions/{action['id']}/approve", headers=h)
        assert again.status_code == 409

    async def test_decline_leaves_the_data_alone(
        self, client, team, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agency, owner, _member = team
        _configure(monkeypatch)
        h = auth_headers(owner)
        lead = Lead(agency_id=agency.id, name="Acme Co")
        db_session.add(lead)
        await db_session.commit()
        conversation_id = (await client.post(f"/agencies/{agency.id}/ai/conversations", headers=h)).json()["id"]
        base = f"/agencies/{agency.id}/ai/conversations/{conversation_id}"

        _stub_stream(
            monkeypatch,
            _tool_use_message("update_lead_status", {"lead_id": str(lead.id), "status": "lost"}),
            _text_message("Proposed."),
        )
        events = _sse_events((await client.post(f"{base}/messages/stream", json={"message": "x"}, headers=h)).text)
        action_id = events[0]["action"]["id"]

        declined = await client.post(f"{base}/actions/{action_id}/decline", headers=h)
        assert declined.json()["status"] == "declined"
        await db_session.refresh(lead)
        assert lead.status == "new"
        assert (await client.post(f"{base}/actions/{action_id}/approve", headers=h)).status_code == 409
