import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

# --- Line items ----------------------------------------------------------


class ProposalLineItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=1024)
    details: str | None = Field(default=None, max_length=4000)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price_cents: int = Field(ge=0)
    # Set when the line was picked from the services catalog.
    service_id: uuid.UUID | None = None


class ProposalLineItemRead(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    details: str | None
    quantity: Decimal
    unit_price_cents: int
    amount_cents: int
    service_id: uuid.UUID | None


class ProposalAttachmentRead(BaseModel):
    id: uuid.UUID
    file_name: str
    mime_type: str
    size: int
    # Hex SHA-256 of the bytes as uploaded.
    sha256: str
    created_at: datetime


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
    attachments: list[ProposalAttachmentRead]
    signature: "ProposalSignatureRead | None"
    # The fingerprint of the document as sent (see signing.py), and the
    # e-sign consent the recipient must accept to sign. None on drafts.
    document_hash: str | None
    consent_text: str
    consent_version: str


class ProposalSignatureRead(BaseModel):
    signer_name: str
    signer_email: str
    signed_at: datetime
    # link | portal; None on signatures made before it was recorded.
    signed_via: str | None = None


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
    attachments: list[ProposalAttachmentRead]
    signature: ProposalSignatureRead | None
    # The fingerprint of the document as sent (see signing.py), and the
    # e-sign consent the recipient must accept to sign. None on drafts.
    document_hash: str | None
    consent_text: str
    consent_version: str


class ProposalSignRequest(BaseModel):
    signer_name: str = Field(min_length=1, max_length=255)
    signer_email: EmailStr
    # The signer ticked the e-sign consent, and the fingerprint of the
    # document they were shown. Both are checked by service.sign_proposal.
    consent: bool = False
    document_hash: str | None = Field(default=None, max_length=64)


class PortalProposalSignRequest(BaseModel):
    """The portal knows who's signing; it still needs consent and the
    fingerprint of what they saw."""

    consent: bool = False
    document_hash: str | None = Field(default=None, max_length=64)


class ProposalDeclineRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1024)


class SendProposalRequest(BaseModel):
    # Overrides the proposal's stored recipient_email for this send only if
    # given — lets staff redirect a send without editing the draft first.
    recipient_email: EmailStr | None = None


# --- Audit trail and signing certificate --------------------------------------


class ProposalEventRead(BaseModel):
    kind: str  # sent | viewed | signed | declined
    occurred_at: datetime
    actor_label: str | None
    ip_address: str | None
    user_agent: str | None
    detail: str | None


class CertificateLineRead(BaseModel):
    description: str
    details: str | None
    quantity: str
    unit_price_cents: int
    amount_cents: int


class CertificateAttachmentRead(BaseModel):
    file_name: str
    size: int
    sha256: str


class CertificateSignatureRead(BaseModel):
    signer_name: str
    signer_email: str
    signature_text: str
    signed_at: datetime
    ip_address: str | None
    user_agent: str | None
    signed_via: str | None
    consent_version: str | None
    consent_text: str | None
    # The fingerprint the signer was shown; None for signatures made before
    # fingerprints were recorded.
    document_hash: str | None


class ProposalCertificateRead(BaseModel):
    """The record of a signed proposal: the document exactly as it was sent
    (read from the frozen snapshot, not today's rows), the signature with its
    evidence, and the audit trail."""

    proposal_id: uuid.UUID
    agency_name: str
    title: str
    recipient_name: str | None
    recipient_email: str | None
    content: str | None
    currency: str
    tax_rate_percent: str
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    valid_until: datetime | None
    sent_at: datetime | None
    line_items: list[CertificateLineRead]
    attachments: list[CertificateAttachmentRead]
    document_hash: str
    # The stored snapshot still hashes to document_hash.
    document_intact: bool
    # The signature was made against this exact fingerprint.
    signature_matches_document: bool
    signature: CertificateSignatureRead
    events: list[ProposalEventRead]
    generated_at: datetime
