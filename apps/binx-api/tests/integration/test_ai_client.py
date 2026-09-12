"""Integration tests for ``binx_api.modules.ai.client`` — the shared,
cost-tracked entry point into Claude: the budget/rate pre-flight check and
``complete()``'s logging on every outcome (ok / error / blocked).

Every test here monkeypatches ``_call_anthropic`` (or leaves the default
autouse fixture's unset key in place) — nothing in this file ever makes a
real network call.
"""

from __future__ import annotations

import asyncio
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


class TestBuildKwargs:
    def test_cache_system_false_sends_plain_string_system(self) -> None:
        kwargs = ai_client._build_kwargs(
            model="claude-opus-5",
            system="hello",
            messages=[],
            max_tokens=10,
            effort="low",
            tools=None,
            response_format=None,
            fast=False,
            cache_system=False,
        )
        assert kwargs["system"] == "hello"
        assert "cache_control" not in kwargs

    def test_cache_system_true_sends_list_shaped_system_with_breakpoint(self) -> None:
        kwargs = ai_client._build_kwargs(
            model="claude-opus-5",
            system="hello",
            messages=[],
            max_tokens=10,
            effort="low",
            tools=[{"name": "x"}],
            response_format=None,
            fast=False,
            cache_system=True,
        )
        # A breakpoint on the last system block caches tools rendered before
        # it too — no separate marker needed on the tool list.
        assert kwargs["system"] == [{"type": "text", "text": "hello", "cache_control": {"type": "ephemeral"}}]
        assert kwargs["cache_control"] == {"type": "ephemeral"}
        assert kwargs["tools"] == [{"name": "x"}]


class TestCacheSystemThroughComplete:
    async def test_default_sends_plain_string_system(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        captured: dict = {}

        async def _capture(**kwargs):
            captured.update(kwargs)
            return _fake_message()

        monkeypatch.setattr(ai_client, "_call_anthropic", _capture)
        await ai_client.complete(
            db_session,
            agency.id,
            owner.id,
            feature=FEATURE_ASSISTANT,
            system="s",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )
        assert captured["system"] == "s"
        assert "cache_control" not in captured

    async def test_cache_system_true_is_passed_through_to_the_request(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        captured: dict = {}

        async def _capture(**kwargs):
            captured.update(kwargs)
            return _fake_message()

        monkeypatch.setattr(ai_client, "_call_anthropic", _capture)
        await ai_client.complete(
            db_session,
            agency.id,
            owner.id,
            feature=FEATURE_ASSISTANT,
            system="s",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
            cache_system=True,
        )
        assert captured["system"] == [{"type": "text", "text": "s", "cache_control": {"type": "ephemeral"}}]
        assert captured["cache_control"] == {"type": "ephemeral"}


class TestLock:
    async def test_lock_serializes_db_sections_but_not_the_network_call(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Reproduces the exact hazard leads/service.py's bulk analysis needs
        guarded against: several concurrent complete() calls sharing one
        AsyncSession. Without the lock, concurrent awaited DB operations on
        one AsyncSession raise a real IllegalStateChangeError; with it, the
        network calls should still overlap (the actual speedup) while the
        DB-touching sections never do."""
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        lock = asyncio.Lock()

        network_in_flight = 0
        max_concurrent_network = 0

        async def _slow_network(**kwargs):
            nonlocal network_in_flight, max_concurrent_network
            network_in_flight += 1
            max_concurrent_network = max(max_concurrent_network, network_in_flight)
            await asyncio.sleep(0.05)
            network_in_flight -= 1
            return _fake_message()

        monkeypatch.setattr(ai_client, "_call_anthropic", _slow_network)

        real_log_event = ai_client._log_event
        db_in_flight = 0
        max_concurrent_db = 0

        async def _tracked_log_event(*args, **kwargs):
            nonlocal db_in_flight, max_concurrent_db
            db_in_flight += 1
            max_concurrent_db = max(max_concurrent_db, db_in_flight)
            await asyncio.sleep(0.02)
            result = await real_log_event(*args, **kwargs)
            db_in_flight -= 1
            return result

        monkeypatch.setattr(ai_client, "_log_event", _tracked_log_event)

        async def _one_call():
            return await ai_client.complete(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
                lock=lock,
            )

        await asyncio.gather(*(_one_call() for _ in range(3)))

        assert max_concurrent_network > 1, "network calls should have overlapped under the lock"
        assert max_concurrent_db == 1, "DB-touching sections must never overlap on one shared session"

        events = await _events(db_session, agency.id)
        assert len(events) == 3
        assert all(e.status == STATUS_OK for e in events)

    async def test_no_lock_is_unaffected(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        """Every other call site passes lock=None (the default) — confirms
        that path still behaves exactly like before this parameter existed."""
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        monkeypatch.setattr(ai_client, "_call_anthropic", lambda **kwargs: _async_return(_fake_message(text="ok")))

        result = await ai_client.complete(
            db_session,
            agency.id,
            owner.id,
            feature=FEATURE_ASSISTANT,
            system="s",
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=100,
        )
        assert result.text == "ok"


class _FakeAsyncStreamManager:
    """A fake ``AsyncMessageStreamManager`` — enough surface for
    complete_stream() to drive: async-context-manager, ``text_stream``
    (an async iterator), and ``get_final_message()``."""

    def __init__(self, deltas: list[str], final_message: object) -> None:
        self._deltas = deltas
        self._final_message = final_message

    async def __aenter__(self) -> _FakeAsyncStreamManager:
        return self

    async def __aexit__(self, *exc_info: object) -> bool:
        return False

    @property
    def text_stream(self):
        async def _gen():
            for delta in self._deltas:
                yield delta

        return _gen()

    async def get_final_message(self):
        return self._final_message


class _FakeFailingStreamManager:
    """A fake stream whose ``text_stream`` raises partway through — for
    testing complete_stream()'s error mapping."""

    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def __aenter__(self) -> _FakeFailingStreamManager:
        return self

    async def __aexit__(self, *exc_info: object) -> bool:
        return False

    @property
    def text_stream(self):
        async def _gen():
            if False:  # pragma: no cover - makes this a generator function
                yield
            raise self._exc

        return _gen()


class TestCompleteStream:
    async def test_yields_deltas_then_turn_complete_and_logs_ok(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        final = _fake_message(text="hello world", input_tokens=1000, output_tokens=200)
        monkeypatch.setattr(
            ai_client, "_stream_anthropic", lambda **kwargs: _FakeAsyncStreamManager(["hello", " world"], final)
        )

        events = [
            event
            async for event in ai_client.complete_stream(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            )
        ]

        assert events[0] == ai_client.TextDelta(text="hello")
        assert events[1] == ai_client.TextDelta(text=" world")
        assert isinstance(events[2], ai_client.TurnComplete)
        assert events[2].message is final

        logged = await _events(db_session, agency.id)
        assert len(logged) == 1
        assert logged[0].status == STATUS_OK
        assert logged[0].cost_cents == 1  # same pricing math as complete()

    async def test_blocked_raises_before_streaming_starts(self, db_session) -> None:
        # The autouse fixture leaves the key unset -> AiNotConfigured.
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        with pytest.raises(HTTPException) as exc_info:
            async for _ in ai_client.complete_stream(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            ):
                pass
        assert exc_info.value.status_code == 503

    async def test_error_mid_stream_is_logged_and_mapped(self, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
        _configure(monkeypatch)
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        exc = _fake_error(anthropic.RateLimitError, status_code=429)
        monkeypatch.setattr(ai_client, "_stream_anthropic", lambda **kwargs: _FakeFailingStreamManager(exc))

        with pytest.raises(HTTPException) as exc_info:
            async for _ in ai_client.complete_stream(
                db_session,
                agency.id,
                owner.id,
                feature=FEATURE_ASSISTANT,
                system="s",
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=100,
            ):
                pass
        assert exc_info.value.status_code == 429

        events = await _events(db_session, agency.id)
        assert len(events) == 1
        assert events[0].status == STATUS_ERROR
