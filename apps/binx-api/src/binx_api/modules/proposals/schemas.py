import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from binx_api.modules.proposals.models import MAX_PROPOSAL_PACKAGES

# --- Line items ----------------------------------------------------------


class ProposalLineItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=1024)
    details: str | None = Field(default=None, max_length=4000)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price_cents: int = Field(ge=0)
    # Set when the line was picked from the services catalog.
    service_id: uuid.UUID | None = None
    # A monthly line is a retainer: its amount is per month, it's left out of
    # the one-time total, and accepting the proposal bills it every month.
    billing: Literal["one_time", "monthly"] = "one_time"
    # The package (by its key in this request's packages) the line is part
    # of; None puts it in every option.
    package_key: str | None = Field(default=None, max_length=40)
    # An add-on the recipient can tick or untick before signing; selected is
    # whether it starts ticked. Ignored on required lines.
    optional: bool = False
    selected: bool = True


class ProposalPackageInput(BaseModel):
    # The form's own handle for the package, so lines can say which one
    # they're in. Not stored.
    key: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    # Selected until the recipient chooses (the first package if none is).
    recommended: bool = False


class ProposalPackageRead(BaseModel):
    id: uuid.UUID
    position: int
    name: str
    description: str | None
    recommended: bool
    # The one currently chosen (by the recipient, or the recommended one).
    selected: bool
    # What the package's own required lines come to, before tax: one-time,
    # and per month.
    price_cents: int
    monthly_price_cents: int


class ProposalLineItemRead(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    details: str | None
    quantity: Decimal
    unit_price_cents: int
    amount_cents: int
    service_id: uuid.UUID | None
    billing: str = "one_time"
    package_id: uuid.UUID | None = None
    optional: bool = False
    selected: bool = True
    # Counts toward the totals: in every option or the chosen package, and
    # ticked if it's an add-on.
    included: bool = True


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
    # Alternatives the recipient picks one of (two to four), or none.
    packages: list[ProposalPackageInput] = Field(default_factory=list, max_length=MAX_PROPOSAL_PACKAGES)
    # The agency countersigns after the client (owner/admin), and the
    # proposal is only complete once both have.
    requires_countersign: bool = False
    # What accepting it sets in motion (proposals/acceptance.py).
    deposit_percent: Decimal | None = Field(default=None, gt=0, le=100, max_digits=6, decimal_places=3)
    create_project_on_accept: bool = False
    kickoff_template_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _kickoff_needs_a_project(self) -> "ProposalCreate":
        if self.kickoff_template_id is not None and not self.create_project_on_accept:
            raise ValueError("A kickoff questionnaire needs a project, turn on “start a project”")
        return self

    @model_validator(mode="after")
    def _packages_hold_together(self) -> "ProposalCreate":
        if not self.packages:
            if any(item.package_key for item in self.line_items):
                raise ValueError("A line is in a package that isn't on the proposal")
            return self
        keys = [package.key for package in self.packages]
        if len(self.packages) < 2:
            raise ValueError("Offer at least two packages, or none")
        if len(set(keys)) != len(keys):
            raise ValueError("Each package needs its own key")
        if len({package.name.strip().lower() for package in self.packages}) != len(keys):
            raise ValueError("Give each package a different name")
        if sum(package.recommended for package in self.packages) > 1:
            raise ValueError("Recommend one package at most")
        used = {item.package_key for item in self.line_items}
        if used - set(keys) - {None}:
            raise ValueError("A line is in a package that isn't on the proposal")
        empty = [package.name for package in self.packages if package.key not in used]
        if empty:
            raise ValueError(f"Add at least one line to the {empty[0]} package")
        return self


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
    # Per month, for the monthly lines (zero when there are none).
    monthly_subtotal_cents: int = 0
    monthly_tax_cents: int = 0
    monthly_total_cents: int = 0
    valid_until: datetime | None
    sent_at: datetime | None
    created_at: datetime


class ProposalAcceptanceRead(BaseModel):
    """What accepting the proposal did (staff only)."""

    # in_progress | awaiting_deposit | done | blocked
    status: str
    blocked_reason: str | None
    client_id: uuid.UUID | None
    client_name: str | None
    converted_lead: bool
    invited_email: str | None
    deposit_invoice_id: uuid.UUID | None
    deposit_invoice_number: str | None
    deposit_invoice_status: str | None
    deposit_paid_at: datetime | None
    project_id: uuid.UUID | None
    project_name: str | None
    kickoff_sent_at: datetime | None
    # The recurring schedule billing the monthly lines, once started.
    retainer_schedule_id: uuid.UUID | None = None
    retainer_next_run_date: date | None = None
    completed_at: datetime | None


class ProposalDetailRead(ProposalRead):
    content: str | None
    tax_rate_percent: Decimal
    viewed_at: datetime | None
    decided_at: datetime | None
    decline_reason: str | None
    share_url: str
    line_items: list[ProposalLineItemRead]
    packages: list[ProposalPackageRead] = Field(default_factory=list)
    attachments: list[ProposalAttachmentRead]
    signature: "ProposalSignatureRead | None"
    # The fingerprint of the document as sent (see signing.py), and the
    # e-sign consent the recipient must accept to sign. None on drafts.
    document_hash: str | None
    consent_text: str
    consent_version: str
    requires_countersign: bool
    countersignature: "ProposalSignatureRead | None"
    # Every required signature is in (the agreement is binding).
    completed_at: datetime | None
    deposit_percent: Decimal | None = None
    create_project_on_accept: bool = False
    kickoff_template_id: uuid.UUID | None = None
    # Staff reads only; None until the proposal is complete (and on portal reads).
    acceptance: ProposalAcceptanceRead | None = None


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
    # Per month, for the monthly lines (zero when there are none).
    monthly_subtotal_cents: int = 0
    monthly_tax_cents: int = 0
    monthly_total_cents: int = 0
    valid_until: datetime | None
    line_items: list[ProposalLineItemRead]
    packages: list[ProposalPackageRead] = Field(default_factory=list)
    attachments: list[ProposalAttachmentRead]
    signature: ProposalSignatureRead | None
    # The fingerprint of the document as sent (see signing.py), and the
    # e-sign consent the recipient must accept to sign. None on drafts.
    document_hash: str | None
    consent_text: str
    consent_version: str
    requires_countersign: bool
    countersignature: "ProposalSignatureRead | None"
    # Every required signature is in (the agreement is binding).
    completed_at: datetime | None


class ProposalSignRequest(BaseModel):
    signer_name: str = Field(min_length=1, max_length=255)
    signer_email: EmailStr
    # The signer ticked the e-sign consent, and the fingerprint of the
    # document they were shown. Both are checked by service.sign_proposal.
    consent: bool = False
    document_hash: str | None = Field(default=None, max_length=64)


class CountersignRequest(BaseModel):
    """An owner or admin countersigning: their consent and the fingerprint
    of the version they're signing (the one the client signed)."""

    consent: bool = False
    document_hash: str | None = Field(default=None, max_length=64)


class PortalProposalSignRequest(BaseModel):
    """The portal knows who's signing; it still needs consent and the
    fingerprint of what they saw."""

    consent: bool = False
    document_hash: str | None = Field(default=None, max_length=64)


class ProposalOptionsRequest(BaseModel):
    """The recipient's choice before signing: one of the packages (required
    when there are any), and the add-ons they want. Add-ons left out are
    unticked."""

    package_id: uuid.UUID | None = None
    add_on_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


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
    billing: str = "one_time"
    # An optional add-on the signer chose.
    add_on: bool = False


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
    # Per month, for the monthly lines (zero when there are none).
    monthly_subtotal_cents: int = 0
    monthly_tax_cents: int = 0
    monthly_total_cents: int = 0
    valid_until: datetime | None
    sent_at: datetime | None
    # The package the signer chose, when the proposal offered packages.
    package_name: str | None = None
    line_items: list[CertificateLineRead]
    attachments: list[CertificateAttachmentRead]
    document_hash: str
    # The stored snapshot still hashes to document_hash.
    document_intact: bool
    # The signature was made against this exact fingerprint.
    signature_matches_document: bool
    signature: CertificateSignatureRead
    requires_countersign: bool
    countersignature: CertificateSignatureRead | None
    completed_at: datetime | None
    events: list[ProposalEventRead]
    generated_at: datetime
