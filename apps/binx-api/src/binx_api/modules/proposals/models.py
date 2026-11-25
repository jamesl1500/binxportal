"""Proposals: a scope-of-work + price document an agency sends a lead (or an
existing client) to review and e-sign before work starts. Lives upstream of
invoicing/models.py's Invoice — a signed proposal doesn't automatically
create an invoice, that's still a separate staff action, same as converting a
lead to a client is separate from creating its first project.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

STATUS_DRAFT = "draft"
STATUS_SENT = "sent"
STATUS_VIEWED = "viewed"
STATUS_SIGNED = "signed"
STATUS_DECLINED = "declined"

proposal_statuses: list[str] = [STATUS_DRAFT, STATUS_SENT, STATUS_VIEWED, STATUS_SIGNED, STATUS_DECLINED]
# Once in one of these, a proposal is closed — no more edits, no more status
# transitions except what got it there.
PROPOSAL_CLOSED_STATUSES: set[str] = {STATUS_SIGNED, STATUS_DECLINED}

# Attachments per proposal — enough for a contract, a deck and a few
# references without turning a proposal into a file share.
MAX_PROPOSAL_ATTACHMENTS = 10


# One proposal document. Optionally tied to a Lead (the common case — sent
# before the prospect is a client) or directly to an AgencyClient (an
# existing client getting a new statement of work); both nullable so a
# proposal can also stand alone. share_token is deliberately stored in the
# clear (unlike ClientInvitation.token_hash) — a proposal link is meant to be
# copyable and re-shareable by staff at any time (Google-Doc-link style),
# not a one-time secret only ever sent to one inbox.
class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), default=None, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agency_clients.id", ondelete="SET NULL"), default=None, index=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    share_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    title: Mapped[str] = mapped_column(String(255))
    recipient_name: Mapped[str | None] = mapped_column(String(255), default=None)
    recipient_email: Mapped[str | None] = mapped_column(String(255), default=None)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    # The scope-of-work prose the client reads above the price table — plain
    # text/markdown, rendered client-side same as leads.ai_summary.
    content: Mapped[str | None] = mapped_column(Text, default=None)

    tax_rate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0"))
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Signing after this date is refused (display-only "expired" state,
    # computed the same way invoicing's "overdue" is — see service.py's
    # _display_status). Null means it never expires.
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    decline_reason: Mapped[str | None] = mapped_column(String(1024), default=None)


class ProposalLineItem(Base):
    __tablename__ = "proposal_line_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("proposals.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(1024))
    # Longer copy shown under the line — what the service actually includes.
    # Copied from Service.description when the line comes from the catalog.
    details: Mapped[str | None] = mapped_column(Text, default=None)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"))
    unit_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    # Which catalog service this line was made from, if any. Provenance only:
    # the values above are a copy and never follow later catalog edits.
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("services.id", ondelete="SET NULL"), default=None, index=True
    )


# A document attached to a proposal (a contract PDF, a portfolio, a brief).
# Added and removed only while the proposal is a draft, so what the recipient
# saw is what was sent. sha256 is the bytes' digest at upload time: the
# record a binding signature will point at. Bytes live in the "agencies"
# storage area under {agency_id}/proposals/{proposal_id}/, which the agency
# purge already sweeps.
class ProposalAttachment(Base):
    __tablename__ = "proposal_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("proposals.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    position: Mapped[int] = mapped_column(Integer, default=0)

    file_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))


# A signed proposal's one signature — one-to-one, created only by
# service.sign_proposal. Kept as its own table (rather than columns on
# Proposal) so "is this signed" is a join away from ever colliding with the
# unsigned columns, and so it's easy to see everything a signature legally
# needs to carry in one place.
class ProposalSignature(Base):
    __tablename__ = "proposal_signatures"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"), unique=True, index=True
    )
    signer_name: Mapped[str] = mapped_column(String(255))
    signer_email: Mapped[str] = mapped_column(String(255))
    # A typed full-name signature (like DocuSign's "type your name" option) —
    # no drawn/uploaded signature image in this first pass.
    signature_text: Mapped[str] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64), default=None)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
