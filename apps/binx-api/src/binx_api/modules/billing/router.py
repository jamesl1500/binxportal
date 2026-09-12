"""Billing / subscription-plan endpoints.

``/agencies/{agency_id}/plan`` — the current plan, its limits, and live usage.
Distinct from invoicing's ``/agencies/{agency_id}/billing-settings`` (the
invoice "from" block). Any member can read; only an owner can switch plans.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.billing import service
from binx_api.modules.billing.models import PLAN_ORDER, PLANS, plan_limits
from binx_api.modules.billing.schemas import (
    BillingPortalRequest,
    BillingPortalSessionRead,
    ChangePlanRequest,
    CheckoutSessionRead,
    PlanCheckoutRequest,
    PlanLimitsRead,
    PlanUsageRead,
    SubscriptionRead,
)

router = APIRouter(prefix="/agencies/{agency_id}/plan", tags=["billing"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
OwnerOnly = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER))]


def _limits_read(plan_key: str) -> PlanLimitsRead:
    return PlanLimitsRead.model_validate(plan_limits(plan_key), from_attributes=True)


async def _subscription_read(db: DbSession, agency: Agency) -> SubscriptionRead:
    subscription = await service.get_or_create_subscription(db, agency.id)
    usage = await service.current_usage(db, agency.id)
    return SubscriptionRead(
        plan=subscription.plan,
        status=subscription.status,
        limits=_limits_read(subscription.plan),
        usage=PlanUsageRead(**usage),
        plan_order=PLAN_ORDER,
        has_stripe_customer=subscription.stripe_customer_id is not None,
        has_stripe_subscription=subscription.stripe_subscription_id is not None,
        cancel_at_period_end=subscription.cancel_at_period_end,
    )


@router.get("", response_model=SubscriptionRead)
async def get_plan(db: DbSession, agency_and_role: AnyMember) -> SubscriptionRead:
    agency, _role = agency_and_role
    return await _subscription_read(db, agency)


@router.get("/catalog", response_model=list[PlanLimitsRead])
async def get_catalog(agency_and_role: AnyMember) -> list[PlanLimitsRead]:
    return [_limits_read(key) for key in PLAN_ORDER if key in PLANS]


@router.post("", response_model=SubscriptionRead)
async def change_plan(
    db: DbSession, data: ChangePlanRequest, current_user: CurrentUser, agency_and_role: OwnerOnly
) -> SubscriptionRead:
    agency, _role = agency_and_role
    await service.change_plan(db, agency, new_plan=data.plan, actor=current_user)
    return await _subscription_read(db, agency)


@router.post("/checkout", response_model=CheckoutSessionRead)
async def start_checkout(
    db: DbSession, data: PlanCheckoutRequest, agency_and_role: OwnerOnly
) -> CheckoutSessionRead:
    agency, _role = agency_and_role
    url = await service.start_checkout(db, agency, plan=data.plan)
    return CheckoutSessionRead(checkout_url=url)


@router.post("/billing-portal", response_model=BillingPortalSessionRead)
async def start_billing_portal(
    db: DbSession, data: BillingPortalRequest, agency_and_role: OwnerOnly
) -> BillingPortalSessionRead:
    agency, _role = agency_and_role
    url = await service.start_billing_portal(db, agency, target_plan=data.target_plan)
    return BillingPortalSessionRead(portal_url=url)
