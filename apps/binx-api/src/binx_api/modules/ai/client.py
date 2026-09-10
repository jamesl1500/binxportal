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

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import anthropic
from anthropic.types import Message, Usage
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.modules.ai.models import STATUS_BLOCKED, STATUS_ERROR, STATUS_OK, AgencyAiSettings, AiUsageEvent

settings = get_settings()

# USD cents per 1,000,000 tokens. Kept in sync with the claude-api skill's
# pricing table — see the AI settings memory for the full source table.
# cache_creation reads at ~1.25x the input rate, cache_read at ~0.1x; nothing
# sets cache_control today, so those only matter once caching is added later.
_PRICING_CENTS_PER_MTOK: dict[str, dict[str, int]] = {
    "claude-opus-5": {"input": 500, "output": 2500},
    "claude-fable-5": {"input": 1000, "output": 5000},
    "claude-mythos-5": {"input": 1000, "output": 5000},
    "claude-opus-4-8": {"input": 500, "output": 2500},
    "claude-opus-4-7": {"input": 500, "output": 2500},
    "claude-opus-4-6": {"input": 500, "output": 2500},
    "claude-sonnet-5": {"input": 200, "output": 1000},
    "claude-sonnet-4-6": {"input": 300, "output": 1500},
    "claude-haiku-4-5": {"input": 100, "output": 500},
}
_DEFAULT_PRICING = _PRICING_CENTS_PER_MTOK["claude-opus-5"]


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


_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def _call_anthropic(**kwargs: Any) -> Message:
    """Thin, monkeypatchable wrapper around the one real network call this
    module makes. Nothing else should import ``anthropic`` directly."""
    return await _get_client().messages.create(**kwargs)


def _pricing_for(model: str) -> dict[str, int]:
    if model in _PRICING_CENTS_PER_MTOK:
        return _PRICING_CENTS_PER_MTOK[model]
    # A dated snapshot id (e.g. "claude-haiku-4-5-20251001") prices the same
    # as its alias — match by prefix rather than requiring an exact key.
    for alias, pricing in _PRICING_CENTS_PER_MTOK.items():
        if model.startswith(alias):
            return pricing
    return _DEFAULT_PRICING


def _cost_cents(model: str, usage: Usage) -> int:
    pricing = _pricing_for(model)
    cache_creation = getattr(usage, "cache_creation_input_tokens", None) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", None) or 0
    cents = (
        usage.input_tokens * pricing["input"]
        + usage.output_tokens * pricing["output"]
        + cache_creation * pricing["input"] * 1.25
        + cache_read * pricing["input"] * 0.1
    ) / 1_000_000
    return round(cents)


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
        select(func.coalesce(func.sum(AiUsageEvent.cost_cents), 0)).where(
            AiUsageEvent.agency_id == agency_id,
            AiUsageEvent.status == STATUS_OK,
            AiUsageEvent.created_at >= _month_start(now),
        )
    )
    if spent.scalar_one() >= effective_budget:
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
    cost_cents: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    error_message: str | None = None,
) -> None:
    db.add(
        AiUsageEvent(
            agency_id=agency_id,
            user_id=user_id,
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_cents=cost_cents,
            status=status_,
            error_message=error_message,
        )
    )
    await db.commit()


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
) -> CompletionResult:
    """``fast=True`` routes the call through ``settings.ai_fast_model`` (a
    cheaper/quicker model) instead of the default ``settings.ai_model`` —
    for templated drafts that don't need the stronger model's reasoning.
    See modules/ai/service.py for which features pass which.

    Haiku-class models (the fast tier today) reject both extended thinking
    and ``output_config.effort`` outright (400 "not supported")  — unlike
    Opus/Sonnet/Fable 5, they were never adaptive-thinking models. So a fast
    call omits ``thinking`` and ``effort`` entirely; ``response_format`` (not
    used by any fast-tier feature today, but kept general) still applies."""
    model = settings.ai_fast_model if fast else settings.ai_model

    try:
        await check_budget_and_rate(db, agency_id, user_id)
    except (AiNotConfigured, AiBudgetExceeded) as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_BLOCKED,
            error_message=str(exc.detail),
        )
        raise

    output_config: dict[str, Any] = {} if fast else {"effort": effort}
    if response_format is not None:
        output_config["format"] = response_format

    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    if not fast:
        kwargs["thinking"] = {"type": "adaptive"}
    if output_config:
        kwargs["output_config"] = output_config
    if tools:
        kwargs["tools"] = tools

    try:
        message = await _call_anthropic(**kwargs)
    except anthropic.BadRequestError as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.NotFoundError as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI isn't configured correctly.") from exc
    except anthropic.RateLimitError as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "AI is rate-limited right now — try again shortly."
        ) from exc
    except anthropic.APIStatusError as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        if exc.status_code >= 500:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly."
            ) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI request failed.") from exc
    except anthropic.APIConnectionError as exc:
        await _log_event(
            db,
            agency_id,
            user_id,
            feature=feature,
            model=model,
            status_=STATUS_ERROR,
            error_message=str(exc),
        )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI is temporarily unavailable — try again shortly.") from exc

    cost = _cost_cents(model, message.usage)
    await _log_event(
        db,
        agency_id,
        user_id,
        feature=feature,
        model=model,
        status_=STATUS_OK,
        cost_cents=cost,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
    )
    return CompletionResult(message=message, text=_extract_text(message))
