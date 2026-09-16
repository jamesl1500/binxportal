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
from datetime import UTC, datetime

import stripe
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import stripe_client
from binx_api.core.config import get_settings
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_SETTINGS, VISIBILITY_ADMIN
from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing.models import (
    DEFAULT_PLAN,
    PLAN_FREE,
    PLAN_PRO,
    PLAN_SCALE,
    PLAN_STARTER,
    PLANS,
    AgencySubscription,
    PlanLimits,
    plan_limits,
)
from binx_api.modules.leads.models import Lead
from binx_api.modules.projects.models import STATUS_ARCHIVED, Project
from binx_api.modules.users.models import User

settings = get_settings()

# Price ids are environment-specific (test vs live mode mint different ids),
# so they live in config, not the plan catalog — see config.py. Maps plan ->
# the *attribute name* on `settings` (not the resolved price id itself) —
# both _price_id_for_plan and _plan_for_price_id do a live getattr(settings,
# attr) lookup, so a plan can pick up a changed/rotated price id without a
# restart clearing any cache of the resolved value.
_PRICE_ID_ATTR: dict[str, str] = {
    PLAN_STARTER: "stripe_price_id_starter",
    PLAN_PRO: "stripe_price_id_pro",
    PLAN_SCALE: "stripe_price_id_scale",
}


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


def _price_id_for_plan(plan: str) -> str:
    attr = _PRICE_ID_ATTR.get(plan)
    price_id = getattr(settings, attr, None) if attr else None
    if not price_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"No Stripe price is configured for the {plan} plan")
    return price_id


def _plan_for_price_id(price_id: str) -> str:
    for plan, attr in _PRICE_ID_ATTR.items():
        if getattr(settings, attr, None) == price_id:
            return plan
    return DEFAULT_PLAN


def _require_stripe_configured() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe isn't configured")


async def start_checkout(db: AsyncSession, agency: Agency, *, plan: str, return_to: str | None = None) -> str:
    """A Checkout Session for subscribing to a paid plan for the first time.
    An existing subscriber must use the Billing Portal instead (see
    ``start_billing_portal``) — Checkout only ever creates a new subscription.
    ``return_to`` is where the browser lands after paying or backing out —
    defaults to Settings > Plan (the original behavior); onboarding passes
    "/dashboard" so a brand-new agency doesn't get dropped into Settings on
    its way in. Already validated as a same-origin relative path by
    PlanCheckoutRequest — safe to embed directly."""
    _require_stripe_configured()
    if plan not in PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")
    if plan == PLAN_FREE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The Free plan doesn't need Checkout")

    return_path = return_to or "/settings/plan"

    subscription = await get_or_create_subscription(db, agency.id)
    if subscription.stripe_subscription_id is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This agency already has a subscription — use the billing portal to change plans",
        )

    price_id = _price_id_for_plan(plan)

    if subscription.stripe_customer_id is None:
        customer = await stripe_client.create_customer({"name": agency.name, "metadata": {"agency_id": str(agency.id)}})
        subscription.stripe_customer_id = customer.id
        await db.commit()
        await db.refresh(subscription)

    session = await stripe_client.create_checkout_session(
        {
            "mode": "subscription",
            "customer": subscription.stripe_customer_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "client_reference_id": str(agency.id),
            "metadata": {"agency_id": str(agency.id)},
            "success_url": f"{settings.frontend_url}{return_path}?checkout=success",
            "cancel_url": f"{settings.frontend_url}{return_path}?checkout=cancel",
        }
    )
    return session.url


async def start_billing_portal(db: AsyncSession, agency: Agency, *, target_plan: str | None = None) -> str:
    """A Billing Portal session. With no ``target_plan``, a plain "manage
    billing" link. With one, deep-links straight into the portal's
    cancel-subscription flow (``target_plan == "free"``) or its
    change-subscription flow (any other paid plan)."""
    _require_stripe_configured()
    subscription = await get_or_create_subscription(db, agency.id)
    if subscription.stripe_customer_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This agency has no Stripe customer yet — subscribe first")

    params: dict = {
        "customer": subscription.stripe_customer_id,
        "return_url": f"{settings.frontend_url}/settings/plan",
    }
    if target_plan == PLAN_FREE:
        if subscription.stripe_subscription_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This agency has no active subscription to cancel")
        params["flow_data"] = {
            "type": "subscription_cancel",
            "subscription_cancel": {"subscription": subscription.stripe_subscription_id},
        }
    elif target_plan is not None:
        if target_plan not in PLANS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")
        if subscription.stripe_subscription_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This agency has no active subscription to change")
        price_id = _price_id_for_plan(target_plan)
        live_subscription = await stripe_client.retrieve_subscription(subscription.stripe_subscription_id)
        item_id = live_subscription.items.data[0].id
        params["flow_data"] = {
            "type": "subscription_update",
            "subscription_update": {
                "subscription": subscription.stripe_subscription_id,
                "items": [{"id": item_id, "price": price_id, "quantity": 1}],
            },
        }

    session = await stripe_client.create_billing_portal_session(params)
    return session.url


async def _apply_stripe_subscription(
    db: AsyncSession, subscription: AgencySubscription, stripe_subscription: stripe.Subscription
) -> None:
    """The one place a live ``stripe.Subscription`` gets written onto our
    row — shared by the checkout-completed and subscription-updated webhook
    handlers, since both ultimately carry the same subscription state."""
    item = stripe_subscription.items.data[0]
    new_plan = _plan_for_price_id(item.price.id)
    previous = subscription.plan

    subscription.stripe_subscription_id = stripe_subscription.id
    subscription.stripe_price_id = item.price.id
    subscription.plan = new_plan
    live_status = stripe_subscription.status
    subscription.status = "active" if live_status in ("active", "trialing") else live_status
    subscription.cancel_at_period_end = bool(stripe_subscription.cancel_at_period_end)
    subscription.current_period_end = (
        datetime.fromtimestamp(item.current_period_end, tz=UTC) if item.current_period_end else None
    )
    await db.commit()
    await db.refresh(subscription)

    if new_plan == previous:
        return

    from binx_api.modules.ai import client as ai_client

    await ai_client.clamp_ai_settings_to_plan(db, subscription.agency_id, plan_limits(new_plan))
    await activity_service.log_agency_activity(
        db,
        subscription.agency_id,
        category=CATEGORY_SETTINGS,
        event_type="plan_changed",
        visibility=VISIBILITY_ADMIN,
        summary=f"Plan changed from {plan_limits(previous).name} to {plan_limits(new_plan).name}",
        actor=None,
    )


async def sync_from_checkout_completed(db: AsyncSession, session: stripe.checkout.Session) -> None:
    # StripeObject isn't a real dict (no .get()) — .to_dict() gives us one.
    metadata = session.metadata.to_dict() if session.metadata else {}
    agency_id = metadata.get("agency_id")
    if agency_id is None or session.subscription is None:
        return
    result = await db.execute(select(AgencySubscription).where(AgencySubscription.agency_id == uuid.UUID(agency_id)))
    subscription = result.scalar_one_or_none()
    if subscription is None:
        return
    live_subscription = await stripe_client.retrieve_subscription(session.subscription)
    await _apply_stripe_subscription(db, subscription, live_subscription)


async def _subscription_by_customer(db: AsyncSession, customer_id: str) -> AgencySubscription | None:
    result = await db.execute(select(AgencySubscription).where(AgencySubscription.stripe_customer_id == customer_id))
    return result.scalar_one_or_none()


async def sync_from_subscription_event(db: AsyncSession, stripe_subscription: stripe.Subscription) -> None:
    subscription = await _subscription_by_customer(db, stripe_subscription.customer)
    if subscription is None:
        return
    await _apply_stripe_subscription(db, subscription, stripe_subscription)


async def sync_from_subscription_deleted(db: AsyncSession, stripe_subscription: stripe.Subscription) -> None:
    subscription = await _subscription_by_customer(db, stripe_subscription.customer)
    if subscription is None:
        return
    previous = subscription.plan
    subscription.plan = PLAN_FREE
    subscription.status = "canceled"
    subscription.stripe_subscription_id = None
    subscription.stripe_price_id = None
    subscription.cancel_at_period_end = False
    subscription.current_period_end = None
    await db.commit()

    from binx_api.modules.ai import client as ai_client

    await ai_client.clamp_ai_settings_to_plan(db, subscription.agency_id, plan_limits(PLAN_FREE))
    if previous != PLAN_FREE:
        await activity_service.log_agency_activity(
            db,
            subscription.agency_id,
            category=CATEGORY_SETTINGS,
            event_type="plan_changed",
            visibility=VISIBILITY_ADMIN,
            summary=f"Plan changed from {plan_limits(previous).name} to Free (subscription canceled)",
            actor=None,
        )


async def mark_payment_failed(db: AsyncSession, customer_id: str) -> None:
    subscription = await _subscription_by_customer(db, customer_id)
    if subscription is None:
        return
    subscription.status = "past_due"
    await db.commit()


async def change_plan(db: AsyncSession, agency: Agency, *, new_plan: str, actor: User | None) -> AgencySubscription:
    if new_plan not in PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")

    subscription = await get_or_create_subscription(db, agency.id)

    # Once Stripe is configured, paid plans (and any change once a real
    # subscription exists) must go through Checkout / the Billing Portal —
    # this direct switch is only for the Free plan on an agency that's never
    # subscribed. With no Stripe key configured (local/dev/CI), nothing here
    # changes from the original behavior.
    if settings.stripe_secret_key and (new_plan != PLAN_FREE or subscription.stripe_subscription_id is not None):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Paid plans are managed through Checkout / the Billing Portal now."
        )

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
