"""The shared, cost-tracked entry point into Claude. Every AI feature in
modules/ai/service.py calls :func:`complete` instead of the Anthropic SDK
directly — it pre-flight checks the agency's budget and the caller's daily
cap (:func:`check_budget_and_rate`), makes the call through the
monkeypatchable :func:`_call_anthropic`, and unconditionally logs an
``AiUsageEvent`` (ok / error / blocked) before returning or raising.

Tests patch ``_call_anthropic`` (mirrors core/email.py::send_email being
patched via the ``email_outbox`` fixture) so nothing here ever makes a real
network call in the suite.
"""

from __future__ import annotations

import json
import uuid
from asyncio import Lock
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import anthropic
from anthropic.lib.streaming import BetaAsyncMessageStreamManager
from anthropic.types import Usage
from anthropic.types.beta import BetaMessage as Message
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.modules.ai.models import STATUS_BLOCKED, STATUS_ERROR, STATUS_OK, AgencyAiSettings, AiUsageEvent

settings = get_settings()

# USD cents per 1,000,000 tokens. Kept in sync with the claude-api skill's
# pricing table. ``cache_read`` is listed per model because the 5.5
# generation dropped it below the old flat 0.1x-of-input (Opus/Sonnet 5.5
# read cache at 0.05x); cache writes (5-minute TTL) are 1.25x input on every
# model. Cache tokens are only nonzero when a call passes cache_system=True
# (see _build_kwargs).
_PRICING_CENTS_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-fable-5-2": {"input": 800, "output": 4000, "cache_read": 20},
    "claude-mythos-5-2": {"input": 800, "output": 4000, "cache_read": 20},
    "claude-fable-5": {"input": 1000, "output": 5000, "cache_read": 100},
    "claude-mythos-5": {"input": 1000, "output": 5000, "cache_read": 100},
    "claude-opus-5-5": {"input": 400, "output": 2000, "cache_read": 20},
    "claude-opus-5": {"input": 500, "output": 2500, "cache_read": 50},
    "claude-opus-4-8": {"input": 500, "output": 2500, "cache_read": 50},
    "claude-opus-4-7": {"input": 500, "output": 2500, "cache_read": 50},
    "claude-opus-4-6": {"input": 500, "output": 2500, "cache_read": 50},
    "claude-sonnet-5-5": {"input": 200, "output": 1000, "cache_read": 10},
    "claude-sonnet-5": {"input": 200, "output": 1000, "cache_read": 20},
    "claude-sonnet-4-6": {"input": 300, "output": 1500, "cache_read": 30},
    "claude-haiku-5-5": {"input": 10, "output": 50, "cache_read": 1},
    "claude-haiku-4-5": {"input": 100, "output": 500, "cache_read": 10},
}
_DEFAULT_PRICING = _PRICING_CENTS_PER_MTOK["claude-opus-5"]
_CACHE_WRITE_MULTIPLIER = 1.25

# Server-tool fees billed on top of tokens. Web search is $10 per 1,000
# searches (1 cent each); web fetch has no per-use fee beyond the tokens the
# fetched page adds.
_WEB_SEARCH_CENTS_PER_REQUEST = 1

# Cost is tracked in microcents (1 cent = 1,000,000) so a call that costs a
# fraction of a cent — nearly every fast-tier call — still counts against the
# agency's budget instead of rounding down to zero.
MICROCENTS_PER_CENT = 1_000_000

# Models that predate adaptive thinking and the effort control, and reject
# both with a 400 ("not supported"). Matched by prefix, so dated snapshots
# (e.g. "claude-haiku-4-5-20251001") are covered. Every newer model accepts
# `thinking: adaptive` + `output_config.effort`, including Haiku 5.5.
_NO_ADAPTIVE_THINKING_PREFIXES = ("claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5", "claude-opus-4-1")

# Extra output room given to a model that thinks: `max_tokens` covers
# thinking plus the visible reply, and each feature's max_tokens was sized
# for the reply alone. Without this a draft can be cut off mid-sentence (or a
# structured response left unparseable) after the tokens were already paid
# for. A ceiling, not a target: unused headroom costs nothing.
_THINKING_HEADROOM_TOKENS = 1024

# Server-side refusal fallback: when the requested model declines on policy
# grounds, the API re-runs the request on a substitute model inside the same
# call (for Sonnet 5.5, "cyber"/"frontier_llm" declines retry on Sonnet 5).
# "default" lets the API pick the substitute, and on a model without
# fallbacks the request simply runs alone — so it's safe on every tier.
# Why every call goes through client.beta.messages.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AiNotConfigured(HTTPException):
    def __init__(self, detail: str = "AI isn't configured for this agency yet.") -> None:
        super().__init__(status.HTTP_503_SERVICE_UNAVAILABLE, detail)


class AiBudgetExceeded(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status.HTTP_429_TOO_MANY_REQUESTS, detail)


@dataclass
class CompletionResult:
    message: Message
    text: str


@dataclass
class TextDelta:
    """One chunk of assistant text, yielded by :func:`complete_stream` as it
    arrives."""

    text: str


@dataclass
class TurnComplete:
    """The terminal event :func:`complete_stream` yields once its stream
    finishes — carries the full ``Message`` (usage, stop_reason, content),
    mirroring what :func:`complete` returns as ``CompletionResult.message``.
    An async generator can't ``return`` a value the way a sync generator's
    ``StopIteration.value`` can, so the final message rides as the last
    yielded item instead."""

    message: Message


StreamEvent = TextDelta | TurnComplete

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def _call_anthropic(**kwargs: Any) -> Message:
    """Thin, monkeypatchable wrapper around the one real non-streaming
    network call this module makes. Nothing else should import ``anthropic``
    directly."""
    return await _get_client().beta.messages.create(**kwargs)


def _stream_anthropic(**kwargs: Any) -> BetaAsyncMessageStreamManager:
    """Thin, monkeypatchable wrapper around the one real streaming network
    call this module makes — mirrors ``_call_anthropic``. Returns the async
    context manager directly (``messages.stream(...)`` isn't itself
    awaitable); the caller does ``async with _stream_anthropic(**kwargs) as
    stream:``."""
    return _get_client().beta.messages.stream(**kwargs)


def _pricing_for(model: str) -> dict[str, float]:
    if model in _PRICING_CENTS_PER_MTOK:
        return _PRICING_CENTS_PER_MTOK[model]
    # A dated snapshot id (e.g. "claude-haiku-4-5-20251001") prices the same
    # as its alias. Longest prefix wins, so "claude-sonnet-5-5-<date>" gets
    # Sonnet 5.5's prices rather than matching the shorter "claude-sonnet-5".
    matches = [alias for alias in _PRICING_CENTS_PER_MTOK if model.startswith(alias)]
    if matches:
        return _PRICING_CENTS_PER_MTOK[max(matches, key=len)]
    return _DEFAULT_PRICING


def supports_adaptive_thinking(model: str) -> bool:
    return not model.startswith(_NO_ADAPTIVE_THINKING_PREFIXES)


def _cost_microcents(model: str, usage: Usage) -> int:
    pricing = _pricing_for(model)
    cache_creation = getattr(usage, "cache_creation_input_tokens", None) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", None) or 0
    # Per-MTok cents x tokens = microcents exactly (cents / 1e6 tokens).
    token_cost = (
        usage.input_tokens * pricing["input"]
        + usage.output_tokens * pricing["output"]
        + cache_creation * pricing["input"] * _CACHE_WRITE_MULTIPLIER
        + cache_read * pricing["cache_read"]
    )
    server_tool_use = getattr(usage, "server_tool_use", None)
    web_searches = (getattr(server_tool_use, "web_search_requests", None) or 0) if server_tool_use else 0
    return round(token_cost) + web_searches * _WEB_SEARCH_CENTS_PER_REQUEST * MICROCENTS_PER_CENT


def _cost_cents(model: str, usage: Usage) -> int:
    """Whole-cent cost for display. Budget enforcement uses the exact
    :func:`_cost_microcents` instead."""
    return round(_cost_microcents(model, usage) / MICROCENTS_PER_CENT)


def _served_model(message: Message, requested: str) -> str:
    """The model that produced the reply — the fallback model when a
    refusal fallback ran, which is what the call is billed at."""
    return getattr(message, "model", None) or requested


def _extract_text(message: Message) -> str:
    return "".join(block.text for block in message.content if block.type == "text")


async def _plan_ai_ceilings(db: AsyncSession, agency_id: uuid.UUID) -> tuple[int, int]:
    """The agency plan's (monthly_budget_cents, daily_user_request_cap)
    ceilings. Lazy import: billing.service reads its AI seed values from this
    module, so a module-level import here would be circular. Falls back to the
    flat ``Settings.ai_default_*`` values if the lookup fails for any reason."""
    try:
        from binx_api.modules.billing import service as billing_service

        limits = await billing_service.get_plan_limits(db, agency_id)
        return limits.ai_monthly_budget_cents, limits.ai_daily_user_cap
    except Exception:
        return settings.ai_default_monthly_budget_cents, settings.ai_default_daily_user_cap


async def clamp_ai_settings_to_plan(db: AsyncSession, agency_id: uuid.UUID, limits: Any) -> None:
    """Lower an agency's AgencyAiSettings to a plan's ceilings after a
    downgrade. Called by billing/service.py::change_plan. No-op when the row
    doesn't exist yet (it'll be seeded from the plan on first access)."""
    result = await db.execute(select(AgencyAiSettings).where(AgencyAiSettings.agency_id == agency_id))
    ai_settings = result.scalar_one_or_none()
    if ai_settings is None:
        return
    ai_settings.monthly_budget_cents = min(ai_settings.monthly_budget_cents, limits.ai_monthly_budget_cents)
    ai_settings.daily_user_request_cap = min(ai_settings.daily_user_request_cap, limits.ai_daily_user_cap)
    await db.commit()


async def get_or_create_ai_settings(db: AsyncSession, agency_id: uuid.UUID) -> AgencyAiSettings:
    result = await db.execute(select(AgencyAiSettings).where(AgencyAiSettings.agency_id == agency_id))
    ai_settings = result.scalar_one_or_none()
    if ai_settings is not None:
        return ai_settings

    budget_ceiling, cap_ceiling = await _plan_ai_ceilings(db, agency_id)
    ai_settings = AgencyAiSettings(
        agency_id=agency_id,
        monthly_budget_cents=budget_ceiling,
        daily_user_request_cap=cap_ceiling,
    )
    db.add(ai_settings)
    try:
        await db.commit()
    except IntegrityError:
        # Two requests raced to lazily create this agency's row (e.g. the
        # settings page's /settings + /usage calls both landing on a first
        # visit) — the loser rolls back and reads what the winner wrote.
        await db.rollback()
        result = await db.execute(select(AgencyAiSettings).where(AgencyAiSettings.agency_id == agency_id))
        return result.scalar_one()
    await db.refresh(ai_settings)
    return ai_settings


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def check_budget_and_rate(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID | None) -> AgencyAiSettings:
    """Raises AiNotConfigured / AiBudgetExceeded, or returns the agency's AI
    settings when the call is allowed to proceed. Doesn't log anything itself
    — the caller (``complete``) logs a `blocked` event with the feature it
    already knows, then re-raises."""
    if not settings.anthropic_api_key:
        raise AiNotConfigured()

    ai_settings = await get_or_create_ai_settings(db, agency_id)
    if not ai_settings.is_enabled:
        raise AiNotConfigured("AI has been turned off for this agency.")

    # The plan sets the ceiling — AgencyAiSettings can lower the budget/cap but
    # never raise it above what the tier allows.
    plan_budget, plan_cap = await _plan_ai_ceilings(db, agency_id)
    effective_budget = min(ai_settings.monthly_budget_cents, plan_budget)
    effective_cap = min(ai_settings.daily_user_request_cap, plan_cap)

    now = datetime.now(UTC)
    spent = await db.execute(
        select(func.coalesce(func.sum(AiUsageEvent.cost_microcents), 0)).where(
            AiUsageEvent.agency_id == agency_id,
            AiUsageEvent.status == STATUS_OK,
            AiUsageEvent.created_at >= _month_start(now),
        )
    )
    if spent.scalar_one() >= effective_budget * MICROCENTS_PER_CENT:
        capped_by_plan = effective_budget == plan_budget and plan_budget < ai_settings.monthly_budget_cents
        where = (
            "Upgrade in Settings → Plan for a bigger budget."
            if capped_by_plan
            else "An owner or admin can raise it in Settings → AI."
        )
        raise AiBudgetExceeded(f"This agency's ${effective_budget / 100:.2f} monthly AI budget is used up. {where}")

    if user_id is not None:
        today_count = await db.execute(
            select(func.count())
            .select_from(AiUsageEvent)
            .where(
                AiUsageEvent.agency_id == agency_id,
                AiUsageEvent.user_id == user_id,
                AiUsageEvent.counts_toward_cap.is_(True),
                AiUsageEvent.created_at >= _day_start(now),
            )
        )
        if today_count.scalar_one() >= effective_cap:
            raise AiBudgetExceeded(
                f"You've reached today's limit of {effective_cap} AI requests. It resets at midnight UTC."
            )

    return ai_settings


async def _log_event(
    db: AsyncSession,
    agency_id: uuid.UUID,
    user_id: uuid.UUID | None,
    *,
    feature: str,
    model: str,
    status_: str,
    cost_microcents: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    error_message: str | None = None,
    counts_toward_cap: bool = True,
) -> None:
    db.add(
        AiUsageEvent(
            agency_id=agency_id,
            user_id=user_id,
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_cents=round(cost_microcents / MICROCENTS_PER_CENT),
            cost_microcents=cost_microcents,
            status=status_,
            error_message=error_message,
            counts_toward_cap=counts_toward_cap,
        )
    )
    await db.commit()


class _NoOpLock:
    """A do-nothing async context manager — used in place of a real
    ``asyncio.Lock`` when no lock was given, so call sites never need an
    ``if lock:`` branch. Safe to share one instance across concurrent
    ``async with`` blocks since it guards nothing."""

    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *exc_info: object) -> bool:
        return False


_NO_OP_LOCK = _NoOpLock()


async def _log_locked(
    lock: Lock | None, db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID | None, **kwargs: Any
) -> None:
    async with lock or _NO_OP_LOCK:
        await _log_event(db, agency_id, user_id, **kwargs)


def _build_kwargs(
    *,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    effort: str,
    tools: list[dict[str, Any]] | None,
    response_format: dict[str, Any] | None,
    cache_system: bool,
) -> dict[str, Any]:
    # Thinking + effort are decided by what the model supports, not by which
    # tier it was picked for: Haiku 4.5 rejects both (400), while Haiku 5.5 —
    # like the Opus/Sonnet/Fable 5 family — thinks adaptively by default, so
    # leaving effort unset there would run every fast-tier draft at the
    # model's default effort instead of the feature's chosen one.
    thinks = supports_adaptive_thinking(model)
    output_config: dict[str, Any] = {"effort": effort} if thinks else {}
    if response_format is not None:
        output_config["format"] = response_format

    system_param: str | list[dict[str, Any]] = system
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens + (_THINKING_HEADROOM_TOKENS if thinks else 0),
        "messages": messages,
    }
    if cache_system:
        # An explicit breakpoint on the system block — per Anthropic's
        # documented render order (tools -> system -> messages), this caches
        # any `tools` passed in the same call too, no separate marker needed.
        # Paired with top-level automatic caching for the growing
        # conversation tail — Anthropic's documented "robust combination for
        # agent loops" (one explicit breakpoint on the static prefix, plus
        # automatic caching for the tail).
        system_param = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        kwargs["cache_control"] = {"type": "ephemeral"}
    kwargs["system"] = system_param
    kwargs["betas"] = [_FALLBACK_BETA]
    kwargs["fallbacks"] = "default"
    if thinks:
        kwargs["thinking"] = {"type": "adaptive"}
    if output_config:
        kwargs["output_config"] = output_config
    if tools:
        kwargs["tools"] = tools
    return kwargs


def parse_json(result: CompletionResult) -> Any:
    """The parsed body of a structured-output (``response_format``) call.
    Raises a clean 502 instead of a bare JSONDecodeError/500 when the reply
    was cut off at ``max_tokens`` or isn't valid JSON for any other reason —
    the call's cost is already logged by then."""
    if result.message.stop_reason == "max_tokens":
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI response was cut off — try again.")
    try:
        return json.loads(result.text)
    except ValueError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI returned an unreadable response.") from exc


async def complete(
    db: AsyncSession,
    agency_id: uuid.UUID,
    user_id: uuid.UUID | None,
    *,
    feature: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    effort: str = "medium",
    tools: list[dict[str, Any]] | None = None,
    response_format: dict[str, Any] | None = None,
    fast: bool = False,
    cache_system: bool = False,
    lock: Lock | None = None,
    counts_toward_cap: bool = True,
) -> CompletionResult:
    """``fast=True`` routes the call through ``settings.ai_fast_model`` (a
    cheaper/quicker model) instead of the default ``settings.ai_model`` —
    for templated drafts that don't need the stronger model's reasoning.
    See modules/ai/service.py for which features pass which.

    Whether ``thinking``/``effort`` are sent depends on the model, not the
    tier — see ``_build_kwargs`` and ``supports_adaptive_thinking``.

    A ``refusal`` stop reason is logged (the tokens were billed) and then
    raised as a 422, so no feature mistakes an empty reply for a real one.

    ``cache_system=True`` caches the system+tools prefix (see
    ``_build_kwargs``) — only worth it for a prefix resent many times, which
    today is just the Ask AI assistant's tool loop; every other feature's
    prefix is far under the per-model cache minimum, so this defaults off.

    ``lock`` serializes this function's two DB-touching sections (the budget
    check and usage logging) without holding the network call under it —
    lets ``leads/service.py``'s bulk analysis run several Claude calls
    concurrently on one shared ``AsyncSession`` (unsafe for true concurrent
    DB access) while still parallelizing the actual (slow) network I/O.
    ``None`` (every other call site) means no locking, unchanged from before
    this parameter existed."""
    model = settings.ai_fast_model if fast else settings.ai_model

    async def _log_error(exc: Exception) -> None:
        await _log_locked(
            lock,
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
            counts_toward_cap=counts_toward_cap,
        )

    async with lock or _NO_OP_LOCK:
        try:
            # A follow-up call skips the daily-cap check (user_id=None): the
            # question it belongs to was already counted. The budget still applies.
            await check_budget_and_rate(db, agency_id, user_id if counts_toward_cap else None)
        except (AiNotConfigured, AiBudgetExceeded) as exc:
            await _log_event(
                db,
                agency_id,
                user_id,
                feature=feature,
                model=model,
                status_=STATUS_BLOCKED,
                error_message=str(exc.detail),
                counts_toward_cap=counts_toward_cap,
            )
            raise

    kwargs = _build_kwargs(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        effort=effort,
        tools=tools,
        response_format=response_format,
        cache_system=cache_system,
    )

    try:
        message = await _call_anthropic(**kwargs)
    except anthropic.BadRequestError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.NotFoundError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.RateLimitError as exc:
        await _log_error(exc)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "AI is rate-limited right now — try again shortly."
        ) from exc
    except anthropic.APIStatusError as exc:
        await _log_error(exc)
        if exc.status_code >= 500:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly."
            ) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except anthropic.APIConnectionError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly.") from exc

    await _log_locked(
        lock,
        db,
        agency_id,
        user_id,
        feature=feature,
        model=_served_model(message, model),
        status_=STATUS_OK,
        cost_microcents=_cost_microcents(_served_model(message, model), message.usage),
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
        counts_toward_cap=counts_toward_cap,
    )
    if message.stop_reason == "refusal":
        # Logged as ok above — the tokens were billed either way.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The AI declined to help with this request.")
    return CompletionResult(message=message, text=_extract_text(message))


async def complete_stream(
    db: AsyncSession,
    agency_id: uuid.UUID,
    user_id: uuid.UUID | None,
    *,
    feature: str,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    effort: str = "medium",
    tools: list[dict[str, Any]] | None = None,
    response_format: dict[str, Any] | None = None,
    fast: bool = False,
    cache_system: bool = False,
    lock: Lock | None = None,
    counts_toward_cap: bool = True,
) -> AsyncIterator[StreamEvent]:
    """Streaming counterpart to :func:`complete` for one Claude call — same
    budget check, error mapping, and cost logging (parameters mean exactly
    what they mean there), but yields :class:`TextDelta` events as the reply
    is generated instead of returning one final :class:`CompletionResult`.
    Always ends by yielding a :class:`TurnComplete` carrying the full
    ``Message`` once the underlying stream finishes, for the caller to
    continue an agentic loop (check ``stop_reason``) or persist the result —
    see the docstring on ``TurnComplete`` for why it rides as an event
    instead of a return value.

    Only one Claude call per invocation, same as ``complete()`` — a
    multi-turn/tool loop calls this repeatedly, it doesn't loop internally.
    """
    model = settings.ai_fast_model if fast else settings.ai_model

    async def _log_error(exc: Exception) -> None:
        await _log_locked(
            lock,
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
            counts_toward_cap=counts_toward_cap,
        )

    async with lock or _NO_OP_LOCK:
        try:
            # A follow-up call skips the daily-cap check (user_id=None): the
            # question it belongs to was already counted. The budget still applies.
            await check_budget_and_rate(db, agency_id, user_id if counts_toward_cap else None)
        except (AiNotConfigured, AiBudgetExceeded) as exc:
            await _log_event(
                db,
                agency_id,
                user_id,
                feature=feature,
                model=model,
                status_=STATUS_BLOCKED,
                error_message=str(exc.detail),
                counts_toward_cap=counts_toward_cap,
            )
            raise

    kwargs = _build_kwargs(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        effort=effort,
        tools=tools,
        response_format=response_format,
        cache_system=cache_system,
    )

    try:
        async with _stream_anthropic(**kwargs) as stream:
            async for text in stream.text_stream:
                yield TextDelta(text=text)
            message = await stream.get_final_message()
    except anthropic.BadRequestError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.NotFoundError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.RateLimitError as exc:
        await _log_error(exc)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "AI is rate-limited right now — try again shortly."
        ) from exc
    except anthropic.APIStatusError as exc:
        await _log_error(exc)
        if exc.status_code >= 500:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly."
            ) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except anthropic.APIConnectionError as exc:
        await _log_error(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly.") from exc

    await _log_locked(
        lock,
        db,
        agency_id,
        user_id,
        feature=feature,
        model=_served_model(message, model),
        status_=STATUS_OK,
        cost_microcents=_cost_microcents(_served_model(message, model), message.usage),
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
        counts_toward_cap=counts_toward_cap,
    )
    yield TurnComplete(message=message)
