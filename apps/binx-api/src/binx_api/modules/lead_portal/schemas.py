import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LeadPortalUpdate(BaseModel):
    """Turn the portal on (or keep it on) and set its welcome note."""

    welcome_message: str | None = Field(default=None, max_length=4000)


class LeadPortalMessageRead(BaseModel):
    id: uuid.UUID
    author_kind: str  # lead | agency
    author_name: str
    body: str
    created_at: datetime


class LeadPortalRead(BaseModel):
    """The staff view of a lead's portal."""

    enabled: bool
    url: str | None
    welcome_message: str | None
    last_viewed_at: datetime | None
    messages: list[LeadPortalMessageRead]


class LeadPortalMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class PublicLeadPortalMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    # Who's writing, when it isn't the lead's main contact.
    author_name: str | None = Field(default=None, max_length=255)


class PublicLeadPortalProposal(BaseModel):
    title: str
    display_status: str
    currency: str
    # None when the proposal asks for an email code: its price stays behind it.
    total_cents: int | None
    # Per month, for its monthly lines (zero when there are none).
    monthly_total_cents: int | None = 0
    valid_until: datetime | None
    sent_at: datetime | None
    # The proposal's own share link: review, download documents, sign.
    url: str


class PublicLeadPortalRead(BaseModel):
    """What the lead sees. Nothing internal: no ids beyond what the page
    needs, no other leads, no staff names beyond who replied."""

    agency_name: str
    brand_color: str | None
    has_logo: bool
    lead_name: str
    contact_name: str | None
    welcome_message: str | None
    proposals: list[PublicLeadPortalProposal]
    messages: list[LeadPortalMessageRead]
    # The lead has signed and been set up as a client: the page points them
    # to their client portal from here on.
    is_client: bool
    portal_login_url: str
