"""Service layer for proposals.

Money handling mirrors invoicing/service.py: integer cents, denormalized
subtotal/tax/total recomputed on every edit (``_recalculate``). A draft is
freely editable; once sent, only status transitions apply (send -> viewed ->
signed/declined) — there is no "un-send" or edit-after-send, same "frozen
once issued" shape as an Invoice.
"""

from __future__ import annotations

import hashlib
import mimetypes
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import storage
from binx_api.core.config import get_settings
from binx_api.core.security import generate_opaque_token
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_PROPOSALS as ACTIVITY_CATEGORY_PROPOSALS
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.leads import service as leads_service
from binx_api.modules.leads.models import Lead
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_INVOICING as NOTIFY_CATEGORY_PROPOSALS
from binx_api.modules.proposals import acceptance, completion, signing
from binx_api.modules.proposals.models import (
    BILLING_MONTHLY,
    EVENT_COUNTERSIGNED,
    EVENT_DECLINED,
    EVENT_SENT,
    EVENT_SIGNED,
    MAX_PROPOSAL_ATTACHMENTS,
    PROPOSAL_CLOSED_STATUSES,
    STATUS_DECLINED,
    STATUS_DRAFT,
    STATUS_SENT,
    STATUS_SIGNED,
    STATUS_VIEWED,
    Proposal,
    ProposalAttachment,
    ProposalCountersignature,
    ProposalLineItem,
    ProposalSignature,
)
from binx_api.modules.proposals.schemas import ProposalLineItemInput
from binx_api.modules.services import service as services_service
from binx_api.modules.users.models import User

settings = get_settings()

SIGNED_VIA_LINK = "link"
SIGNED_VIA_PORTAL = "portal"


@dataclass(frozen=True)
class Visitor:
    """Who is acting on a proposal and from where, for the audit trail: the
    share-link recipient (no account) or a signed-in portal contact."""

    ip_address: str | None
    user_agent: str | None
    label: str
    user_id: uuid.UUID | None = None


def _round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _line_amount(quantity: Decimal, unit_price_cents: int) -> int:
    return _round_cents(Decimal(quantity) * Decimal(unit_price_cents))


def _tax(subtotal: int, rate: Decimal) -> int:
    return _round_cents(Decimal(subtotal) * Decimal(rate) / Decimal(100))


def _recalculate(proposal: Proposal, line_items: list[ProposalLineItem]) -> None:
    """One-time lines make the total; monthly lines a separate per-month
    total, taxed at the same rate."""
    one_time = sum(item.amount_cents for item in line_items if item.billing != BILLING_MONTHLY)
    monthly = sum(item.amount_cents for item in line_items if item.billing == BILLING_MONTHLY)
    proposal.subtotal_cents = one_time
    proposal.tax_cents = _tax(one_time, proposal.tax_rate_percent)
    proposal.total_cents = one_time + proposal.tax_cents
    proposal.monthly_subtotal_cents = monthly
    proposal.monthly_tax_cents = _tax(monthly, proposal.tax_rate_percent)
    proposal.monthly_total_cents = monthly + proposal.monthly_tax_cents


def display_status(proposal: Proposal, *, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    if proposal.status in (STATUS_SENT, STATUS_VIEWED) and proposal.valid_until and proposal.valid_until < now:
        return "expired"
    if proposal.status == STATUS_SIGNED and proposal.completed_at is None:
        # The client has signed; the agency's countersignature is still due.
        return "awaiting_countersign"
    return proposal.status


def share_url(proposal: Proposal) -> str:
    # Query-param token, not a path segment — matches the frontend's existing
    # token-link convention (e.g. /auth/portal-invite?token=...).
    return f"{settings.frontend_url}/proposals/public?token={proposal.share_token}"


def _require_draft(proposal: Proposal) -> None:
    if proposal.status != STATUS_DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a draft proposal can be edited")


async def get_proposal_or_404(db: AsyncSession, agency_id: uuid.UUID, proposal_id: uuid.UUID) -> Proposal:
    result = await db.execute(select(Proposal).where(Proposal.id == proposal_id, Proposal.agency_id == agency_id))
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    return proposal


async def get_proposal_by_token_or_404(db: AsyncSession, raw_token: str) -> Proposal:
    # An agency on its deletion hold has no public links.
    result = await db.execute(
        select(Proposal)
        .join(Agency, Agency.id == Proposal.agency_id)
        .where(Proposal.share_token == raw_token, Agency.deletion_scheduled_for.is_(None))
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    return proposal


async def list_line_items(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalLineItem]:
    result = await db.execute(
        select(ProposalLineItem).where(ProposalLineItem.proposal_id == proposal_id).order_by(ProposalLineItem.position)
    )
    return list(result.scalars().all())


async def _replace_line_items(
    db: AsyncSession, proposal: Proposal, line_items: list[ProposalLineItemInput]
) -> list[ProposalLineItem]:
    await services_service.validate_service_ids(db, proposal.agency_id, (item.service_id for item in line_items))
    await db.execute(
        delete(ProposalLineItem)
        .where(ProposalLineItem.proposal_id == proposal.id)
        .execution_options(synchronize_session=False)
    )
    rows: list[ProposalLineItem] = []
    for position, item in enumerate(line_items):
        row = ProposalLineItem(
            proposal_id=proposal.id,
            position=position,
            description=item.description,
            details=(item.details or "").strip() or None,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
            amount_cents=_line_amount(item.quantity, item.unit_price_cents),
            service_id=item.service_id,
            billing=item.billing,
        )
        db.add(row)
        rows.append(row)
    return rows


async def get_signature(db: AsyncSession, proposal_id: uuid.UUID) -> ProposalSignature | None:
    result = await db.execute(select(ProposalSignature).where(ProposalSignature.proposal_id == proposal_id))
    return result.scalar_one_or_none()


# ---- Attachments -----------------------------------------------------------


async def list_attachments(db: AsyncSession, proposal_id: uuid.UUID) -> list[ProposalAttachment]:
    result = await db.execute(
        select(ProposalAttachment)
        .where(ProposalAttachment.proposal_id == proposal_id)
        .order_by(ProposalAttachment.position, ProposalAttachment.created_at)
    )
    return list(result.scalars().all())


async def get_attachment_or_404(
    db: AsyncSession, proposal_id: uuid.UUID, attachment_id: uuid.UUID
) -> ProposalAttachment:
    result = await db.execute(
        select(ProposalAttachment).where(
            ProposalAttachment.id == attachment_id, ProposalAttachment.proposal_id == proposal_id
        )
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return attachment


def _clean_file_name(raw: str | None) -> str:
    """The name shown to people and used for the download. Path parts are
    dropped (some browsers prefix a fake Windows path); the storage key
    never uses it, so this is about display, not safety."""
    name = (raw or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    name = "".join(ch for ch in name if ch.isprintable())
    return (name or "attachment")[:255]


async def add_attachment(
    db: AsyncSession,
    proposal: Proposal,
    *,
    uploaded_by: User,
    file_name: str | None,
    content: bytes,
    mime_type: str | None,
) -> ProposalAttachment:
    _require_draft(proposal)
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That file is empty")
    if len(content) > settings.proposal_upload_max_bytes:
        max_mb = settings.proposal_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")
    count = (await db.execute(select(func.count()).where(ProposalAttachment.proposal_id == proposal.id))).scalar_one()
    if count >= MAX_PROPOSAL_ATTACHMENTS:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A proposal can have at most {MAX_PROPOSAL_ATTACHMENTS} attachments"
        )

    name = _clean_file_name(file_name)
    generic = "application/octet-stream"
    sent_type = mime_type if mime_type and mime_type != generic else None
    resolved_type = sent_type or mimetypes.guess_type(name)[0] or generic
    # The key is ours alone, so no part of a client-supplied name ever reaches
    # a filesystem path or an S3 key.
    storage_path = await storage.save(
        "agencies",
        f"{proposal.agency_id}/proposals/{proposal.id}/{uuid.uuid4().hex}",
        content,
        content_type=resolved_type,
    )
    attachment = ProposalAttachment(
        proposal_id=proposal.id,
        uploaded_by_id=uploaded_by.id,
        position=count,
        file_name=name,
        storage_path=storage_path,
        mime_type=resolved_type,
        size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def remove_attachment(db: AsyncSession, proposal: Proposal, attachment: ProposalAttachment) -> None:
    _require_draft(proposal)
    storage_path = attachment.storage_path
    await db.delete(attachment)
    await db.commit()
    await storage.delete(storage_path)


# ---- Create / update -----------------------------------------------------


async def _check_kickoff_template(db: AsyncSession, agency_id: uuid.UUID, template_id: uuid.UUID | None) -> None:
    if template_id is None:
        return
    from binx_api.modules.kickoffs import service as kickoffs_service

    await kickoffs_service.get_template_or_404(db, agency_id, template_id)


async def create_proposal(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    lead_id: uuid.UUID | None,
    client_id: uuid.UUID | None,
    title: str,
    recipient_name: str | None,
    recipient_email: str | None,
    content: str | None,
    currency: str,
    tax_rate_percent: Decimal,
    valid_until: datetime | None,
    line_items: list[ProposalLineItemInput],
    requires_countersign: bool = False,
    deposit_percent: Decimal | None = None,
    create_project_on_accept: bool = False,
    kickoff_template_id: uuid.UUID | None = None,
) -> Proposal:
    lead: Lead | None = None
    if lead_id is not None:
        lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    if client_id is not None:
        await agencies_service.get_client_or_404(db, agency.id, client_id)
    await _check_kickoff_template(db, agency.id, kickoff_template_id)

    proposal = Proposal(
        agency_id=agency.id,
        lead_id=lead_id,
        client_id=client_id,
        created_by_id=created_by.id,
        share_token=generate_opaque_token(),
        title=title,
        recipient_name=recipient_name or (lead.contact_name if lead else None),
        recipient_email=recipient_email or (lead.contact_email if lead else None),
        currency=currency,
        content=content,
        tax_rate_percent=tax_rate_percent,
        valid_until=valid_until,
        requires_countersign=requires_countersign,
        deposit_percent=deposit_percent,
        create_project_on_accept=create_project_on_accept,
        kickoff_template_id=kickoff_template_id,
        status=STATUS_DRAFT,
    )
    db.add(proposal)
    await db.flush()

    rows = await _replace_line_items(db, proposal, line_items)
    _recalculate(proposal, rows)
    await db.commit()
    await db.refresh(proposal)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_created",
        summary=f"{created_by.full_name} drafted the proposal “{proposal.title}”",
        actor=created_by,
        target_type="proposal",
        target_id=proposal.id,
        target_name=proposal.title,
    )
    return proposal


async def update_proposal(
    db: AsyncSession,
    proposal: Proposal,
    *,
    lead_id: uuid.UUID | None,
    client_id: uuid.UUID | None,
    title: str,
    recipient_name: str | None,
    recipient_email: str | None,
    content: str | None,
    currency: str,
    tax_rate_percent: Decimal,
    valid_until: datetime | None,
    line_items: list[ProposalLineItemInput],
    requires_countersign: bool = False,
    deposit_percent: Decimal | None = None,
    create_project_on_accept: bool = False,
    kickoff_template_id: uuid.UUID | None = None,
) -> Proposal:
    _require_draft(proposal)
    if lead_id is not None:
        await leads_service.get_lead_or_404(db, proposal.agency_id, lead_id)
    if client_id is not None:
        await agencies_service.get_client_or_404(db, proposal.agency_id, client_id)
    await _check_kickoff_template(db, proposal.agency_id, kickoff_template_id)

    proposal.lead_id = lead_id
    proposal.client_id = client_id
    proposal.title = title
    proposal.recipient_name = recipient_name
    proposal.recipient_email = recipient_email
    proposal.content = content
    proposal.currency = currency
    proposal.tax_rate_percent = tax_rate_percent
    proposal.valid_until = valid_until
    proposal.requires_countersign = requires_countersign
    proposal.deposit_percent = deposit_percent
    proposal.create_project_on_accept = create_project_on_accept
    proposal.kickoff_template_id = kickoff_template_id

    rows = await _replace_line_items(db, proposal, line_items)
    _recalculate(proposal, rows)
    await db.commit()
    await db.refresh(proposal)
    return proposal


async def list_proposals(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    lead_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_filter: str | None = None,
) -> list[tuple[Proposal, str | None, str | None]]:
    query = (
        select(Proposal, Lead.name, AgencyClient.name)
        .outerjoin(Lead, Lead.id == Proposal.lead_id)
        .outerjoin(AgencyClient, AgencyClient.id == Proposal.client_id)
        .where(Proposal.agency_id == agency_id)
    )
    if lead_id is not None:
        query = query.where(Proposal.lead_id == lead_id)
    if client_id is not None:
        query = query.where(Proposal.client_id == client_id)
    query = query.order_by(Proposal.created_at.desc())

    rows = (await db.execute(query)).all()
    if status_filter:
        now = datetime.now(UTC)
        rows = [r for r in rows if display_status(r[0], now=now) == status_filter]
    return [(proposal, lead_name, client_name) for proposal, lead_name, client_name in rows]


async def delete_proposal(db: AsyncSession, proposal: Proposal, *, actor: User | None = None) -> None:
    if proposal.status != STATUS_DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a draft proposal can be deleted")
    agency_id = proposal.agency_id
    title = proposal.title
    storage_paths = [attachment.storage_path for attachment in await list_attachments(db, proposal.id)]
    await db.delete(proposal)
    await db.commit()
    for storage_path in storage_paths:
        await storage.delete(storage_path)

    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_deleted",
        summary=(
            f"{actor.full_name} deleted the draft proposal “{title}”" if actor else f"Draft proposal “{title}” deleted"
        ),
        actor=actor,
        target_type="proposal",
        target_name=title,
    )


# ---- Send / view (staff + public) -----------------------------------------


async def send_proposal(
    db: AsyncSession, proposal: Proposal, *, sent_by: User, recipient_email: str | None
) -> Proposal:
    if proposal.status in PROPOSAL_CLOSED_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been decided")
    if (await list_line_items(db, proposal.id)) == []:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add at least one line item before sending")
    if recipient_email:
        proposal.recipient_email = recipient_email
    if not proposal.recipient_email:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add a recipient email before sending")

    proposal.status = STATUS_SENT
    proposal.sent_at = datetime.now(UTC)
    # Frozen now, with the final recipient and sent date in it: this is the
    # document a signature will point at (see signing.py).
    await signing.freeze_document(db, proposal)
    signing.record_event(
        db,
        proposal.id,
        EVENT_SENT,
        actor_user_id=sent_by.id,
        actor_label=sent_by.full_name,
        detail=f"Sent to {proposal.recipient_email}",
    )
    await db.commit()
    await db.refresh(proposal)

    await activity_service.log_agency_activity(
        db,
        proposal.agency_id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_sent",
        summary=f"{sent_by.full_name} sent the proposal “{proposal.title}” to {proposal.recipient_email}",
        actor=sent_by,
        target_type="proposal",
        target_id=proposal.id,
        target_name=proposal.title,
    )
    return proposal


async def record_view(db: AsyncSession, proposal: Proposal, visitor: Visitor | None = None) -> Proposal:
    """Called when the recipient opens it (share link or portal). The first
    view flips sent -> viewed; each view from a new browser (or after the
    dedupe window) adds a "viewed" row to the audit trail."""
    changed = False
    if proposal.status == STATUS_SENT:
        proposal.status = STATUS_VIEWED
        proposal.viewed_at = datetime.now(UTC)
        changed = True
    if visitor is not None:
        changed = (
            await signing.record_view(
                db,
                proposal.id,
                actor_user_id=visitor.user_id,
                actor_label=visitor.label,
                ip_address=visitor.ip_address,
                user_agent=visitor.user_agent,
            )
            or changed
        )
    if changed:
        await db.commit()
        await db.refresh(proposal)
    return proposal


async def sign_proposal(
    db: AsyncSession,
    proposal: Proposal,
    *,
    signer_name: str,
    signer_email: str,
    ip_address: str | None,
    user_agent: str | None = None,
    signed_via: str = SIGNED_VIA_LINK,
    consent: bool = False,
    document_hash: str | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> Proposal:
    """A binding e-signature needs the signer's consent to sign
    electronically and must be tied to the exact document they saw: the
    request carries the fingerprint they were shown, and anything else is
    refused (see signing.py)."""
    if proposal.status in PROPOSAL_CLOSED_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been decided")
    if display_status(proposal) == "expired":
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has expired — ask the agency to resend it")
    if not consent:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Agree to sign electronically before signing this proposal"
        )
    await signing.ensure_document_record(db, proposal)
    if not document_hash or document_hash != proposal.document_hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This isn't the version of the proposal you were sent. Reload the page and sign again.",
        )

    now = datetime.now(UTC)
    db.add(
        ProposalSignature(
            proposal_id=proposal.id,
            signer_name=signer_name,
            signer_email=signer_email,
            signature_text=signer_name,
            ip_address=ip_address,
            signed_at=now,
            user_agent=user_agent,
            signed_via=signed_via,
            consent_version=signing.CONSENT_VERSION,
            consent_text=signing.CONSENT_TEXT,
            document_hash=proposal.document_hash,
        )
    )
    signing.record_event(
        db,
        proposal.id,
        EVENT_SIGNED,
        actor_user_id=actor_user_id,
        actor_label=f"{signer_name} <{signer_email}>",
        ip_address=ip_address,
        user_agent=user_agent,
        detail=f"Signed via {'the client portal' if signed_via == SIGNED_VIA_PORTAL else 'the share link'}",
        occurred_at=now,
    )
    proposal.status = STATUS_SIGNED
    proposal.decided_at = now
    if not proposal.requires_countersign:
        proposal.completed_at = now
    await db.commit()
    await db.refresh(proposal)

    if proposal.created_by_id is not None:
        awaiting = proposal.completed_at is None
        await notifications_service.notify(
            db,
            user_id=proposal.created_by_id,
            category=NOTIFY_CATEGORY_PROPOSALS,
            event_type="proposal_awaiting_countersign" if awaiting else "proposal_signed",
            title=(
                f"{signer_name} signed “{proposal.title}”. It's ready for your countersignature"
                if awaiting
                else f"{signer_name} signed “{proposal.title}”"
            ),
            body=f"Signed by {signer_name} ({signer_email}).",
            link=f"/proposals/{proposal.id}",
            agency_id=proposal.agency_id,
        )
    await activity_service.log_agency_activity(
        db,
        proposal.agency_id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_signed",
        summary=f"{signer_name} signed the proposal “{proposal.title}”",
        target_type="proposal",
        target_id=proposal.id,
        target_name=proposal.title,
    )
    if proposal.completed_at is not None:
        await _on_completed(db, proposal)
        # Acceptance can roll the session back on a failure, which expires
        # this object; hand the caller a loaded one.
        await db.refresh(proposal)
    return proposal


async def _on_completed(db: AsyncSession, proposal: Proposal, *, agency_email: str | None = None) -> None:
    """Every required signature is in: see completion.py."""
    if agency_email is None and proposal.created_by_id is not None:
        creator = await db.get(User, proposal.created_by_id)
        agency_email = creator.email if creator else None
    proposal_id = proposal.id
    await acceptance.accept(db, proposal)
    proposal = await db.get(Proposal, proposal_id, populate_existing=True)
    assert proposal is not None
    await completion.send_signed_record(db, proposal, agency_email=agency_email)


async def get_countersignature(db: AsyncSession, proposal_id: uuid.UUID) -> ProposalCountersignature | None:
    return await db.scalar(select(ProposalCountersignature).where(ProposalCountersignature.proposal_id == proposal_id))


async def countersign_proposal(
    db: AsyncSession,
    proposal: Proposal,
    *,
    user: User,
    ip_address: str | None,
    user_agent: str | None,
    consent: bool,
    document_hash: str | None,
) -> Proposal:
    """The agency's signature, after the client's, on a proposal that
    requires one. Same rules as the client's: consent to sign electronically
    and the fingerprint of the exact version, which is the one the client
    signed. Completes the proposal."""
    if not proposal.requires_countersign:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal doesn't need a countersignature")
    if proposal.status != STATUS_SIGNED:
        raise HTTPException(status.HTTP_409_CONFLICT, "The client hasn't signed this proposal yet")
    if proposal.completed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been countersigned")
    if not consent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Agree to sign electronically before countersigning")
    if not document_hash or document_hash != proposal.document_hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This isn't the version the client signed. Reload the page and countersign again.",
        )

    now = datetime.now(UTC)
    db.add(
        ProposalCountersignature(
            proposal_id=proposal.id,
            user_id=user.id,
            signer_name=user.full_name,
            signer_email=user.email,
            signature_text=user.full_name,
            ip_address=ip_address,
            user_agent=user_agent,
            signed_at=now,
            consent_version=signing.CONSENT_VERSION,
            consent_text=signing.CONSENT_TEXT,
            document_hash=proposal.document_hash,
        )
    )
    signing.record_event(
        db,
        proposal.id,
        EVENT_COUNTERSIGNED,
        actor_user_id=user.id,
        actor_label=f"{user.full_name} <{user.email}>",
        ip_address=ip_address,
        user_agent=user_agent,
        detail="Countersigned for the agency",
        occurred_at=now,
    )
    proposal.completed_at = now
    await db.commit()
    await db.refresh(proposal)

    await activity_service.log_agency_activity(
        db,
        proposal.agency_id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_countersigned",
        summary=f"{user.full_name} countersigned the proposal “{proposal.title}”",
        actor=user,
        target_type="proposal",
        target_id=proposal.id,
        target_name=proposal.title,
    )
    agency_email = user.email
    await _on_completed(db, proposal, agency_email=agency_email)
    await db.refresh(proposal)
    return proposal


async def decline_proposal(
    db: AsyncSession, proposal: Proposal, *, reason: str | None, visitor: Visitor | None = None
) -> Proposal:
    if proposal.status in PROPOSAL_CLOSED_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been decided")

    proposal.status = STATUS_DECLINED
    proposal.decided_at = datetime.now(UTC)
    proposal.decline_reason = reason
    signing.record_event(
        db,
        proposal.id,
        EVENT_DECLINED,
        actor_user_id=visitor.user_id if visitor else None,
        actor_label=visitor.label if visitor else None,
        ip_address=visitor.ip_address if visitor else None,
        user_agent=visitor.user_agent if visitor else None,
        detail=reason,
        occurred_at=proposal.decided_at,
    )
    await db.commit()
    await db.refresh(proposal)

    if proposal.created_by_id is not None:
        await notifications_service.notify(
            db,
            user_id=proposal.created_by_id,
            category=NOTIFY_CATEGORY_PROPOSALS,
            event_type="proposal_declined",
            title=f"“{proposal.title}” was declined",
            body=reason or "No reason was given.",
            link=f"/proposals/{proposal.id}",
            agency_id=proposal.agency_id,
        )
    await activity_service.log_agency_activity(
        db,
        proposal.agency_id,
        category=ACTIVITY_CATEGORY_PROPOSALS,
        event_type="proposal_declined",
        summary=f"The proposal “{proposal.title}” was declined",
        target_type="proposal",
        target_id=proposal.id,
        target_name=proposal.title,
    )
    return proposal


async def get_public_proposal(
    db: AsyncSession, raw_token: str, visitor: Visitor | None = None
) -> tuple[Proposal, Agency]:
    proposal = await get_proposal_by_token_or_404(db, raw_token)
    if proposal.status == STATUS_DRAFT:
        # Never reachable via a real link (drafts have no valid share yet in
        # spirit, even though the token exists from creation) — treat as 404
        # rather than leaking draft content.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    agency = await db.get(Agency, proposal.agency_id)
    assert agency is not None
    await signing.ensure_document_record(db, proposal)
    proposal = await record_view(db, proposal, visitor)
    return proposal, agency
