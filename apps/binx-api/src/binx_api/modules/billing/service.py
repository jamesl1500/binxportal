"""Billing service — the one place plan limits are read and enforced.

``get_plan_limits`` resolves an agency's current ``PlanLimits``; the
``_check_can_create_*`` seams in agencies/projects/leads call
``assert_within_limit`` with a live count; ``ai/client.py`` reads the AI
budget/cap ceilings from here too. Nothing here imports another module's
*service* layer (only models), so it can be imported freely without cycles;
the one exception is ``ai.client`` in ``change_plan``, imported lazily.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_SETTINGS, VISIBILITY_ADMIN
from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing.models import (
    PLANS,
    AgencySubscription,
    PlanLimits,
    plan_limits,
)
from binx_api.modules.leads.models import Lead
from binx_api.modules.projects.models import STATUS_ARCHIVED, Project
from binx_api.modules.users.models import User


async def get_or_create_subscription(db: AsyncSession, agency_id: uuid.UUID) -> AgencySubscription:
    result = await db.execute(select(AgencySubscription).where(AgencySubscription.agency_id == agency_id))
    subscription = result.scalar_one_or_none()
    if subscription is not None:
        return subscription

    subscription = AgencySubscription(agency_id=agency_id)
    db.add(subscription)
    try:
        await db.commit()
    except IntegrityError:
        # Two requests raced to lazily create this agency's row — the loser
        # rolls back and reads what the winner wrote (mirrors
        # ai/client.py::get_or_create_ai_settings).
        await db.rollback()
        result = await db.execute(select(AgencySubscription).where(AgencySubscription.agency_id == agency_id))
        return result.scalar_one()
    await db.refresh(subscription)
    return subscription


async def get_plan_limits(db: AsyncSession, agency_id: uuid.UUID) -> PlanLimits:
    subscription = await get_or_create_subscription(db, agency_id)
    return plan_limits(subscription.plan)


def assert_within_limit(count: int, limit: int | None, *, resource: str, plan_name: str) -> None:
    """Raise 402 when creating one more of ``resource`` would exceed the plan.
    ``limit is None`` means unlimited. The message is surfaced verbatim by the
    frontend's AuthApiError handling."""
    if limit is not None and count >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Your {plan_name} plan is limited to {limit} {resource}. Upgrade in Settings → Plan to add more.",
        )


async def max_owned_agencies_for(db: AsyncSession, owner: User) -> int | None:
    """The owned-agency cap for ``owner`` — the most generous
    ``max_owned_agencies`` across the plans of the agencies they already own.
    Falls back to the Free plan's cap when they own none (their first agency)."""
    result = await db.execute(
        select(AgencySubscription.plan)
        .join(AgencyMember, AgencyMember.agency_id == AgencySubscription.agency_id)
        .where(AgencyMember.user_id == owner.id, AgencyMember.role == ROLE_OWNER)
    )
    owned_plans = [plan_limits(plan) for (plan,) in result.all()]
    if not owned_plans:
        return PLANS["free"].max_owned_agencies
    if any(limits.max_owned_agencies is None for limits in owned_plans):
        return None
    return max(limits.max_owned_agencies for limits in owned_plans)  # type: ignore[type-var]


async def _count(db: AsyncSession, stmt) -> int:
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def current_usage(db: AsyncSession, agency_id: uuid.UUID) -> dict[str, int]:
    """Live resource counts for the Plan page's usage bars."""
    clients = await _count(
        db,
        select(func.count())
        .select_from(AgencyClient)
        .where(AgencyClient.agency_id == agency_id, AgencyClient.is_active.is_(True)),
    )
    projects = await _count(
        db,
        select(func.count())
        .select_from(Project)
        .where(Project.agency_id == agency_id, Project.status != STATUS_ARCHIVED),
    )
    leads = await _count(db, select(func.count()).select_from(Lead).where(Lead.agency_id == agency_id))
    members = await _count(
        db, select(func.count()).select_from(AgencyMember).where(AgencyMember.agency_id == agency_id)
    )
    return {"clients": clients, "active_projects": projects, "leads": leads, "team_members": members}


async def change_plan(db: AsyncSession, agency: Agency, *, new_plan: str, actor: User | None) -> AgencySubscription:
    if new_plan not in PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")

    subscription = await get_or_create_subscription(db, agency.id)
    previous = subscription.plan
    if new_plan == previous:
        return subscription

    subscription.plan = new_plan
    subscription.status = "active"
    await db.commit()
    await db.refresh(subscription)

    # A downgrade can put the agency's AI budget/cap above the new ceiling —
    # clamp the AgencyAiSettings row back down. Lazy import: ai.client imports
    # billing.service for its seed values, so a module-level import here would
    # be circular.
    from binx_api.modules.ai import client as ai_client

    await ai_client.clamp_ai_settings_to_plan(db, agency.id, plan_limits(new_plan))

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_SETTINGS,
        event_type="plan_changed",
        visibility=VISIBILITY_ADMIN,
        summary=(
            f"{actor.full_name} changed the plan from {plan_limits(previous).name} to {plan_limits(new_plan).name}"
            if actor
            else f"Plan changed from {plan_limits(previous).name} to {plan_limits(new_plan).name}"
        ),
        actor=actor,
    )
    return subscription
