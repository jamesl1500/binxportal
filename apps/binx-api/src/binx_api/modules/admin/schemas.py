import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PlanMixRow(BaseModel):
    key: str
    name: str
    # Agencies on this plan (their *effective* plan — a live trial counts as
    # the trial plan). Agencies with no subscription row yet are Free.
    agencies: int
    # Of those, how many are only there on a trial.
    trialing: int


class WeeklySignups(BaseModel):
    week_start: date  # Monday, UTC
    agencies: int
    users: int


class RecentAgency(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime | None
    plan: str
    plan_name: str
    trialing: bool
    owner_name: str | None
    owner_email: str | None
    members: int
    clients: int


class PlatformOverview(BaseModel):
    agencies_total: int
    agencies_new_7d: int
    agencies_new_30d: int

    users_total: int
    users_new_7d: int
    # Distinct people with at least one agency membership / portal contact.
    staff_users: int
    portal_users: int

    clients_total: int
    projects_active: int

    # Agencies with a live paid Stripe subscription (not a trial).
    paying_agencies: int
    # Their list prices summed — an estimate (ignores coupons/proration).
    mrr_cents: int
    trialing_agencies: int
    plan_mix: list[PlanMixRow]

    signups_by_week: list[WeeklySignups]
    recent_agencies: list[RecentAgency]


# ---- Support tooling ------------------------------------------------------

_ROLE_PATTERN = "^(user|admin)$"
_PLAN_PATTERN = "^(starter|pro|scale)$"


class AuditEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str
    action: str
    target_type: str
    target_id: uuid.UUID
    target_label: str
    detail: str | None
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditEntryRead]
    total: int


class AdminNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AdminAgencyRow(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    subdomain: str | None
    created_at: datetime | None
    plan: str
    plan_name: str
    trialing: bool
    subscription_status: str | None
    owner_name: str | None
    owner_email: str | None
    members: int
    clients: int
    active_projects: int
    # Set while the agency is on its 30-day deletion hold.
    deletion_scheduled_for: datetime | None = None


class AdminAgencyPage(BaseModel):
    items: list[AdminAgencyRow]
    total: int


class AdminSubscriptionRead(BaseModel):
    plan: str
    plan_name: str
    effective_plan: str
    status: str
    trial_plan: str | None
    trial_ends_at: datetime | None
    trialing: bool
    has_used_trial: bool
    current_period_end: datetime | None
    cancel_at_period_end: bool
    stripe_customer_id: str | None
    stripe_subscription_id: str | None


class AdminAgencyMember(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    role: str
    title: str | None
    is_active: bool
    joined_at: datetime | None


class AdminAgencyClient(BaseModel):
    id: uuid.UUID
    name: str
    portal_contacts: int
    created_at: datetime | None


class AdminActivityRead(BaseModel):
    id: uuid.UUID
    category: str
    event_type: str
    summary: str
    actor_name: str | None
    created_at: datetime | None


class AdminAgencyDetail(AdminAgencyRow):
    subscription: AdminSubscriptionRead
    team: list[AdminAgencyMember]
    client_list: list[AdminAgencyClient]
    projects_total: int
    open_feedback: int
    activity: list[AdminActivityRead]
    audit: list[AuditEntryRead]


class TrialGrant(BaseModel):
    plan: str = Field(pattern=_PLAN_PATTERN)
    days: int = Field(ge=1, le=90)
    reason: str | None = Field(default=None, max_length=500)


class AgencyRestoreRequest(BaseModel):
    """``owner_email`` is only needed when the agency has no owner left."""

    owner_email: str | None = Field(default=None, max_length=255)


class AdminUserRow(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    user_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime | None
    last_login_at: datetime | None
    agencies: int
    portals: int


class AdminUserPage(BaseModel):
    items: list[AdminUserRow]
    total: int


class AdminUserMembership(BaseModel):
    agency_id: uuid.UUID
    agency_name: str
    role: str
    joined_at: datetime | None


class AdminUserPortal(BaseModel):
    agency_id: uuid.UUID
    agency_name: str
    client_id: uuid.UUID
    client_name: str


class AdminUserFeedback(BaseModel):
    id: uuid.UUID
    kind: str
    status: str
    message: str
    created_at: datetime | None


class AdminUserDetail(AdminUserRow):
    phone_number: str | None
    job_title: str | None
    memberships: list[AdminUserMembership]
    portals_list: list[AdminUserPortal]
    security: list[AdminActivityRead]
    feedback: list[AdminUserFeedback]
    audit: list[AuditEntryRead]
    active_sessions: int


class DeactivateRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RoleChange(BaseModel):
    role: str = Field(pattern=_ROLE_PATTERN)


class AdminSearchResult(BaseModel):
    agencies: list[AdminAgencyRow]
    users: list[AdminUserRow]


class AdminActionResult(BaseModel):
    """What a one-shot action did, as a sentence the console can show."""

    message: str
