from pydantic import BaseModel, Field


class PlanLimitsRead(BaseModel):
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


class PlanUsageRead(BaseModel):
    clients: int
    active_projects: int
    leads: int
    team_members: int


class SubscriptionRead(BaseModel):
    plan: str
    status: str
    limits: PlanLimitsRead
    usage: PlanUsageRead
    plan_order: list[str]
    # Derived booleans only — raw Stripe ids never reach the frontend.
    has_stripe_customer: bool = False
    has_stripe_subscription: bool = False
    cancel_at_period_end: bool = False


class ChangePlanRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=20)


class PlanCheckoutRequest(BaseModel):
    plan: str = Field(min_length=1, max_length=20)


class BillingPortalRequest(BaseModel):
    target_plan: str | None = Field(default=None, max_length=20)


class CheckoutSessionRead(BaseModel):
    checkout_url: str


class BillingPortalSessionRead(BaseModel):
    portal_url: str
