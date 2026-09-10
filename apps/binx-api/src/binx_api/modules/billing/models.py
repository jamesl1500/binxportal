"""Billing plans — a code-defined subscription scaffold (no payment provider).

Every agency has one lazily-created ``AgencySubscription`` row that names its
plan; the plan's limits themselves live in ``PLANS`` here (a plain dict, so a
tier tweak never needs a migration). The limits are enforced at the existing
``_check_can_create_*`` seams in agencies/projects/leads services and at the AI
budget check in ``ai/client.py`` — see ``billing/service.py``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Subscription lifecycle. Only "active" is reachable today — the others are
# here so a real payment provider can be wired in later without a migration.
SUBSCRIPTION_STATUSES: list[str] = ["active", "trialing", "past_due", "canceled"]

PLAN_FREE = "free"
PLAN_STARTER = "starter"
PLAN_PRO = "pro"
PLAN_SCALE = "scale"

# Cheapest → most expensive. Used for the catalog ordering and "is this an
# upgrade or a downgrade" comparisons on the frontend.
PLAN_ORDER: list[str] = [PLAN_FREE, PLAN_STARTER, PLAN_PRO, PLAN_SCALE]


@dataclass(frozen=True)
class PlanLimits:
    """A plan tier and every cap it carries. ``None`` means unlimited."""

    key: str
    name: str
    price_cents_month: int
    max_owned_agencies: int | None
    max_clients: int | None
    max_active_projects: int | None
    max_leads: int | None
    max_team_members: int | None
    ai_monthly_budget_cents: int
    ai_daily_user_cap: int


PLANS: dict[str, PlanLimits] = {
    PLAN_FREE: PlanLimits(
        key=PLAN_FREE,
        name="Free",
        price_cents_month=0,
        max_owned_agencies=1,
        max_clients=3,
        max_active_projects=3,
        max_leads=25,
        max_team_members=3,
        ai_monthly_budget_cents=1000,
        ai_daily_user_cap=15,
    ),
    PLAN_STARTER: PlanLimits(
        key=PLAN_STARTER,
        name="Starter",
        price_cents_month=4900,
        max_owned_agencies=2,
        max_clients=15,
        max_active_projects=25,
        max_leads=250,
        max_team_members=10,
        ai_monthly_budget_cents=5000,
        ai_daily_user_cap=50,
    ),
    PLAN_PRO: PlanLimits(
        key=PLAN_PRO,
        name="Pro",
        price_cents_month=14900,
        max_owned_agencies=5,
        max_clients=60,
        max_active_projects=150,
        max_leads=2000,
        max_team_members=40,
        ai_monthly_budget_cents=20000,
        ai_daily_user_cap=200,
    ),
    PLAN_SCALE: PlanLimits(
        key=PLAN_SCALE,
        name="Scale",
        price_cents_month=39900,
        max_owned_agencies=None,
        max_clients=None,
        max_active_projects=None,
        max_leads=None,
        max_team_members=150,
        ai_monthly_budget_cents=75000,
        ai_daily_user_cap=500,
    ),
}

DEFAULT_PLAN = PLAN_FREE


def plan_limits(plan_key: str) -> PlanLimits:
    """The limits for ``plan_key``, falling back to the Free plan for an
    unrecognised value (an old row from a plan that was later removed)."""
    return PLANS.get(plan_key, PLANS[DEFAULT_PLAN])


# One row per agency, created lazily on first access — same pattern as
# ai/models.py's AgencyAiSettings and invoicing's AgencyBillingSettings.
class AgencySubscription(Base):
    __tablename__ = "agency_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, index=True)

    plan: Mapped[str] = mapped_column(String(20), default=DEFAULT_PLAN)
    status: Mapped[str] = mapped_column(String(20), default="active")
    # When the current paid period ends. Null on the Free plan / until a
    # payment provider is wired in.
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
