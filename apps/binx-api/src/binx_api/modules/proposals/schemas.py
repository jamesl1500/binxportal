import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

# --- Line items ----------------------------------------------------------


class ProposalLineItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=1024)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price_cents: int = Field(ge=0)


class ProposalLineItemRead(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    quantity: Decimal
    unit_price_cents: int
    amount_cents: int


# --- Create / update -------------------------------------------------------


class ProposalCreate(BaseModel):
    lead_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    recipient_name: str | None = Field(default=None, max_length=255)
    recipient_email: EmailStr | None = None
    content: str | None = Field(default=None, max_length=20_000)
    currency: str = Field(default="USD", pattern="^[A-Za-z]{3}$")
    tax_rate_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=6, decimal_places=3)
    valid_until: datetime | None = None
    line_items: list[ProposalLineItemInput] = Field(default_factory=list)


class ProposalUpdate(ProposalCreate):
    """Full replace of a draft proposal — same shape as create."""


# --- Reads -----------------------------------------------------------------


class ProposalRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    lead_id: uuid.UUID | None
    client_id: uuid.UUID | None
    lead_name: str | None
    client_name: str | None
    title: str
    recipient_name: str | None
    recipient_email: str | None
    status: str
    # draft | sent | viewed | signed | declined | expired — expired is
    # derived (past valid_until, still sent/viewed), same idea as
    # invoicing's display_status.
    display_status: str
    currency: str
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    valid_until: datetime | None
    sent_at: datetime | None
    created_at: datetime


class ProposalDetailRead(ProposalRead):
    content: str | None
    tax_rate_percent: Decimal
    viewed_at: datetime | None
    decided_at: datetime | None
    decline_reason: str | None
    share_url: str
    line_items: list[ProposalLineItemRead]
    signature: "ProposalSignatureRead | None"


class ProposalSignatureRead(BaseModel):
    signer_name: str
    signer_email: str
    signed_at: datetime


# --- Public (unauthenticated, token-scoped) view ---------------------------


class ProposalPublicRead(BaseModel):
    """What an unauthenticated recipient sees at /proposals/public/{token} —
    deliberately excludes agency_id/lead_id/internal ids."""

    agency_name: str
    title: str
    recipient_name: str | None
    status: str
    display_status: str
    content: str | None
    currency: str
    tax_rate_percent: Decimal
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    valid_until: datetime | None
    line_items: list[ProposalLineItemRead]
    signature: ProposalSignatureRead | None


class ProposalSignRequest(BaseModel):
    signer_name: str = Field(min_length=1, max_length=255)
    signer_email: EmailStr


class ProposalDeclineRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1024)


class SendProposalRequest(BaseModel):
    # Overrides the proposal's stored recipient_email for this send only if
    # given — lets staff redirect a send without editing the draft first.
    recipient_email: EmailStr | None = None
