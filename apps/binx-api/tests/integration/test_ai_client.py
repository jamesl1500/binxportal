"""Integration tests for ``binx_api.modules.ai.client`` — the shared,
cost-tracked entry point into Claude: the budget/rate pre-flight check and
``complete()``'s logging on every outcome (ok / error / blocked).

Every test here monkeypatches ``_call_anthropic`` (or leaves the default
autouse fixture's unset key in place) — nothing in this file ever makes a
real network call.
"""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.ai import client as ai_client
from binx_api.modules.ai.models import (
    FEATURE_ASSISTANT,
    STATUS_BLOCKED,
    STATUS_ERROR,
    STATUS_OK,
    AgencyAiSettings,
    AiUsageEvent,
)
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.integration


def _configure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Undo the autouse "no real calls" fixture's unset key for one test that
    wants the "AI is configured" branch — ``_call_anthropic`` is still
    monkeypatched separately, so nothing hits the network either way. Also
    pins the model names, independent of whatever a developer's local .env
    happens to set AI_MODEL/AI_FAST_MODEL to, so cost-math assertions stay
    deterministic."""
    monkeypatch.setattr(ai_client.settings, "anthropic_api_key", "sk-test-fake-key")
    monkeypatch.setattr(ai_client.settings, "ai_model", "claude-opus-5")
    monkeypatch.setattr(ai_client.settings, "ai_fast_model", "claude-haiku-4-5")


def _fake_usage(input_tokens: int = 1000, output_tokens: int = 200) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )


def _fake_message(text: str = "hello", stop_reason: str = "end_turn", **usage_kwargs) -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=_fake_usage(**usage_kwargs),
        stop_reason=stop_reason,
    )


def _fake_error(cls, status_code: int = 500):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    if cls is anthropic.APIConnectionError:
        return cls(request=request)
    response = httpx2.Response(status_code=status_code, request=request)
    return cls("boom", response=response, body=None)


async def _events(db, agency_id) -> list[AiUsageEvent]:
    result = await db.execute(select(AiUsageEvent).where(AiUsageEvent.agency_id == agency_id))
    return list(result.scalars().all())


class TestCheckBudgetAndRate:
    async def test_raises_when_not_configured(self, db_session) -> None:
        # The autouse fixture already leaves the key unset.
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        with pytest.raises(ai_client.AiNotConfigured):
            await ai_client.check_budget_and_rate(db_session, agency.id, owner.id)

    async def test_raises_when_disabled(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        ai_settings.is_enabled = False
        await db_session.commit()

        with pytest.raises(ai_client.AiNotConfigured):
            await ai_client.check_budget_and_rate(db_session, agency.id, owner.id)

    async def test_raises_over_monthly_budget(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        ai_settings.monthly_budget_cents = 100
        await db_session.commit()

        db_session.add(
            AiUsageEvent(
                agency_id=agency.id,
                user_id=owner.id,
                feature=FEATURE_ASSISTANT,
                model="claude-opus-5",
                input_tokens=1,
                output_tokens=1,
                cost_cents=150,
                status=STATUS_OK,
            )
        )
        await db_session.commit()

        with pytest.raises(ai_client.AiBudgetExceeded):
            await ai_client.check_budget_and_rate(db_session, agency.id, owner.id)

    async def test_raises_over_daily_user_cap(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        other = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        ai_settings.daily_user_request_cap = 2
        await db_session.commit()

        for _ in range(2):
            db_session.add(
                AiUsageEvent(
                    agency_id=agency.id,
                    user_id=owner.id,
                    feature=FEATURE_ASSISTANT,
                    model="claude-opus-5",
                    input_tokens=1,
                    output_tokens=1,
                    cost_cents=1,
                    status=STATUS_OK,
                )
            )
        await db_session.commit()

        with pytest.raises(ai_client.AiBudgetExceeded):
            await ai_client.check_budget_and_rate(db_session, agency.id, owner.id)

        # A different member of the same agency has their own, unused cap.
        await ai_client.check_budget_and_rate(db_session, agency.id, other.id)

    async def test_settings_are_seeded_from_the_plan(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        from binx_api.modules.billing import models as billing_models

        plan = dataclasses.replace(billing_models.PLANS["free"], ai_monthly_budget_cents=4242, ai_daily_user_cap=7)
        monkeypatch.setitem(billing_models.PLANS, "free", plan)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        ai_settings = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        assert ai_settings.monthly_budget_cents == 4242
        assert ai_settings.daily_user_request_cap == 7
        assert ai_settings.is_enabled is True

        # Idempotent — a second call returns the same row, not a new one.
        again = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        assert again.id == ai_settings.id

    async def test_concurrent_creation_race_falls_back_to_the_winners_row(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Reproduces a real bug: two requests (e.g. the settings page's
        /settings and /usage calls) both find no row and both try to create
        one — the loser must recover by reading what the winner committed,
        not blow up with an unhandled IntegrityError."""
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        # The row that "won" the race — already committed for real.
        winner = AgencyAiSettings(agency_id=agency.id, monthly_budget_cents=999, daily_user_request_cap=5)
        db_session.add(winner)
        await db_session.commit()

        # Make our function's first SELECT act as if it ran *before* the
        # winner's row existed — its INSERT then hits the real unique
        # constraint (a genuine IntegrityError from Postgres, not faked).
        real_execute = db_session.execute
        calls = {"n": 0}

        async def _stale_first_read(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                return SimpleNamespace(scalar_one_or_none=lambda: None)
            return await real_execute(*args, **kwargs)

        monkeypatch.setattr(db_session, "execute", _stale_first_read)

        result = await ai_client.get_or_create_ai_settings(db_session, agency.id)
        assert result.id == winner.id
        assert result.monthly_budget_cents == 999


class TestComplete:
    async def test_logs_blocked_event_when_not_configured(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        with pytest.raises(HTTPException) as exc_info:
            await ai_client.complete(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            )
        assert exc_info.value.status_code == 503

        events = await _events(db_session, agency.id)
        assert len(events) == 1
        assert events[0].status == STATUS_BLOCKED
        assert events[0].cost_cents == 0
        assert events[0].feature == FEATURE_ASSISTANT

    async def test_logs_ok_event_with_correct_cost_on_success(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        monkeypatch.setattr(
            ai_client,
            "_call_anthropic",
            lambda **kwargs: _async_return(_fake_message(text="hi there", input_tokens=1000, output_tokens=200)),
        )

        result = await ai_client.complete(
            db_session,
            agency.id,
            owner.id,
            feature=FEATURE_ASSISTANT,
            system="s",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )
        assert result.text == "hi there"

        events = await _events(db_session, agency.id)
        assert len(events) == 1
        # claude-opus-5: $5/$25 per 1M tokens -> (1000*500 + 200*2500)/1e6 = 1.0 cent
        assert events[0].status == STATUS_OK
        assert events[0].cost_cents == 1
        assert events[0].input_tokens == 1000
        assert events[0].output_tokens == 200
        assert events[0].model == "claude-opus-5"

    async def test_fast_flag_routes_to_the_fast_model_and_its_pricing(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        captured: dict = {}

        async def _capture(**kwargs):
            captured.update(kwargs)
            return _fake_message(text="draft", input_tokens=1000, output_tokens=200)

        monkeypatch.setattr(ai_client, "_call_anthropic", _capture)

        await ai_client.complete(
            db_session,
            agency.id,
            owner.id,
            feature=FEATURE_ASSISTANT,
            system="s",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
            fast=True,
        )

        assert captured["model"] == "claude-haiku-4-5"
        events = await _events(db_session, agency.id)
        # claude-haiku-4-5: $1/$5 per 1M tokens -> (1000*100 + 200*500)/1e6 = 0.2 cent -> rounds to 0
        assert events[0].model == "claude-haiku-4-5"
        assert events[0].cost_cents == 0

    async def test_pricing_matches_a_dated_snapshot_model_id_by_prefix(self) -> None:
        # AI_FAST_MODEL is often set to a dated id like "claude-haiku-4-5-20251001"
        # rather than the bare alias — cost math should still use haiku pricing.
        usage = SimpleNamespace(
            input_tokens=1000, output_tokens=200, cache_creation_input_tokens=0, cache_read_input_tokens=0
        )
        assert ai_client._cost_cents("claude-haiku-4-5-20251001", usage) == ai_client._cost_cents(
            "claude-haiku-4-5", usage
        )

    async def test_logs_error_event_on_rate_limit(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        def _raise(**kwargs):
            raise _fake_error(anthropic.RateLimitError, status_code=429)

        monkeypatch.setattr(ai_client, "_call_anthropic", lambda **kwargs: _async_raise(_raise))

        with pytest.raises(HTTPException) as exc_info:
            await ai_client.complete(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            )
        assert exc_info.value.status_code == 429

        events = await _events(db_session, agency.id)
        assert len(events) == 1
        assert events[0].status == STATUS_ERROR
        assert events[0].cost_cents == 0

    async def test_maps_server_error_to_502(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        def _raise(**kwargs):
            raise _fake_error(anthropic.APIStatusError, status_code=503)

        monkeypatch.setattr(ai_client, "_call_anthropic", lambda **kwargs: _async_raise(_raise))

        with pytest.raises(HTTPException) as exc_info:
            await ai_client.complete(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            )
        assert exc_info.value.status_code == 502


async def _async_return(value):
    return value


async def _async_raise(fn):
    fn()
