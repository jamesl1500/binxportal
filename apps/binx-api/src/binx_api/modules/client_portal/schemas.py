import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

# ---- Portal (the client-facing side) --------------------------------------


class PortalAgencyRead(BaseModel):
    """The agency, as a client sees it — name + branding only, nothing internal."""

    id: uuid.UUID
    name: str
    has_logo: bool = False
    logo_version: str | None = None
    brand_color: str | None = None
    # Whether this agency can accept real online invoice payments (Stripe
    # Connect onboarding complete) — gates PayInvoiceButton on the frontend.
    stripe_charges_enabled: bool = False


class PortalClientRead(BaseModel):
    id: uuid.UUID
    name: str


class PortalContactRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: EmailStr
    title: str | None
    is_primary: bool


class PortalMembershipRead(BaseModel):
    """One (agency, client) the signed-in user is a portal contact for."""

    agency: PortalAgencyRead
    client: PortalClientRead


class PortalContextRead(BaseModel):
    """Everything the portal shell needs on load: the active membership plus
    the full list (for a future switcher — the skeleton renders the first)."""

    agency: PortalAgencyRead
    client: PortalClientRead
    contact: PortalContactRead
    memberships: list[PortalMembershipRead]


class PortalProgress(BaseModel):
    total_tasks: int
    done_tasks: int
    percent: int  # 0–100, done / total (0 when there are no tasks)


class PortalProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    description: str | None
    start_date: date | None
    due_date: date | None
    progress: PortalProgress


class PortalBoardColumn(BaseModel):
    name: str
    position: int
    task_count: int


class PortalProjectDetailRead(PortalProjectRead):
    columns: list[PortalBoardColumn]


# ---- Staff side: managing a client's portal contacts ---------------------


class ClientContactInvitationCreate(BaseModel):
    email: EmailStr
    title: str | None = Field(default=None, max_length=255)


class ClientContactRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: EmailStr
    title: str | None
    is_primary: bool
    joined_at: datetime


class ClientInvitationRead(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    agency_id: uuid.UUID
    email: EmailStr
    status: str
    invited_by_name: str
    created_at: datetime
    expires_at: datetime
    is_expired: bool = False
    accept_url: str | None = None


class ClientInvitationAccept(BaseModel):
    token: str


class ClientInvitationPreview(BaseModel):
    """What an unauthenticated visitor sees before logging in to accept."""

    agency_name: str
    client_name: str
    invited_by_name: str
    email: EmailStr
