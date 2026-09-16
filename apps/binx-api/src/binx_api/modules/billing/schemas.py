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
    # Where the browser lands after Stripe Checkout completes/cancels —
    # embedded directly into a Stripe-hosted redirect, so restricted to a
    # same-origin relative path (leading "/", no "//" protocol-relative
    # tricks, no scheme) to avoid turning this into an open redirect.
    # Unset keeps the original behavior (lands on Settings > Plan).
    # No lookahead — pydantic's regex engine doesn't support it. Same intent
    # (reject "//host" protocol-relative URLs): the character right after
    # the leading "/" must be a normal path character, never another "/".
    return_to: str | None = Field(default=None, max_length=200, pattern=r"^/([A-Za-z0-9_-][A-Za-z0-9/_-]*)?$")


class BillingPortalRequest(BaseModel):
    target_plan: str | None = Field(default=None, max_length=20)


class CheckoutSessionRead(BaseModel):
    checkout_url: str


class BillingPortalSessionRead(BaseModel):
    portal_url: str
