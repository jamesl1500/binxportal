"""Service layer for proposals.

Money handling mirrors invoicing/service.py: integer cents, denormalized
subtotal/tax/total recomputed on every edit (``_recalculate``). A draft is
freely editable; once sent, only status transitions apply (send -> viewed ->
signed/declined) — there is no "un-send" or edit-after-send, same "frozen
once issued" shape as an Invoice.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from binx_api.modules.proposals.models import (
    PROPOSAL_CLOSED_STATUSES,
    STATUS_DECLINED,
    STATUS_DRAFT,
    STATUS_SENT,
    STATUS_SIGNED,
    STATUS_VIEWED,
    Proposal,
    ProposalLineItem,
    ProposalSignature,
)
from binx_api.modules.proposals.schemas import ProposalLineItemInput
from binx_api.modules.users.models import User

settings = get_settings()


def _round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _line_amount(quantity: Decimal, unit_price_cents: int) -> int:
    return _round_cents(Decimal(quantity) * Decimal(unit_price_cents))


def _recalculate(proposal: Proposal, line_items: list[ProposalLineItem]) -> None:
    subtotal = sum(item.amount_cents for item in line_items)
    tax = _round_cents(Decimal(subtotal) * Decimal(proposal.tax_rate_percent) / Decimal(100))
    proposal.subtotal_cents = subtotal
    proposal.tax_cents = tax
    proposal.total_cents = subtotal + tax


def display_status(proposal: Proposal, *, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    if proposal.status in (STATUS_SENT, STATUS_VIEWED) and proposal.valid_until and proposal.valid_until < now:
        return "expired"
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
    result = await db.execute(select(Proposal).where(Proposal.share_token == raw_token))
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
    await db.execute(ProposalLineItem.__table__.delete().where(ProposalLineItem.proposal_id == proposal.id))
    rows: list[ProposalLineItem] = []
    for position, item in enumerate(line_items):
        row = ProposalLineItem(
            proposal_id=proposal.id,
            position=position,
            description=item.description,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
            amount_cents=_line_amount(item.quantity, item.unit_price_cents),
        )
        db.add(row)
        rows.append(row)
    return rows


async def get_signature(db: AsyncSession, proposal_id: uuid.UUID) -> ProposalSignature | None:
    result = await db.execute(select(ProposalSignature).where(ProposalSignature.proposal_id == proposal_id))
    return result.scalar_one_or_none()


# ---- Create / update -----------------------------------------------------


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
) -> Proposal:
    lead: Lead | None = None
    if lead_id is not None:
        lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    if client_id is not None:
        await agencies_service.get_client_or_404(db, agency.id, client_id)

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
) -> Proposal:
    _require_draft(proposal)
    if lead_id is not None:
        await leads_service.get_lead_or_404(db, proposal.agency_id, lead_id)
    if client_id is not None:
        await agencies_service.get_client_or_404(db, proposal.agency_id, client_id)

    proposal.lead_id = lead_id
    proposal.client_id = client_id
    proposal.title = title
    proposal.recipient_name = recipient_name
    proposal.recipient_email = recipient_email
    proposal.content = content
    proposal.currency = currency
    proposal.tax_rate_percent = tax_rate_percent
    proposal.valid_until = valid_until

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
    await db.delete(proposal)
    await db.commit()

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


async def record_view(db: AsyncSession, proposal: Proposal) -> Proposal:
    """Called from the public GET — first view only flips sent -> viewed."""
    if proposal.status == STATUS_SENT:
        proposal.status = STATUS_VIEWED
        proposal.viewed_at = datetime.now(UTC)
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
) -> Proposal:
    if proposal.status in PROPOSAL_CLOSED_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been decided")
    if display_status(proposal) == "expired":
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has expired — ask the agency to resend it")

    now = datetime.now(UTC)
    db.add(
        ProposalSignature(
            proposal_id=proposal.id,
            signer_name=signer_name,
            signer_email=signer_email,
            signature_text=signer_name,
            ip_address=ip_address,
            signed_at=now,
        )
    )
    proposal.status = STATUS_SIGNED
    proposal.decided_at = now
    await db.commit()
    await db.refresh(proposal)

    if proposal.created_by_id is not None:
        await notifications_service.notify(
            db,
            user_id=proposal.created_by_id,
            category=NOTIFY_CATEGORY_PROPOSALS,
            event_type="proposal_signed",
            title=f"{signer_name} signed “{proposal.title}”",
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
    return proposal


async def decline_proposal(db: AsyncSession, proposal: Proposal, *, reason: str | None) -> Proposal:
    if proposal.status in PROPOSAL_CLOSED_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has already been decided")

    proposal.status = STATUS_DECLINED
    proposal.decided_at = datetime.now(UTC)
    proposal.decline_reason = reason
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


async def get_public_proposal(db: AsyncSession, raw_token: str) -> tuple[Proposal, Agency]:
    proposal = await get_proposal_by_token_or_404(db, raw_token)
    if proposal.status == STATUS_DRAFT:
        # Never reachable via a real link (drafts have no valid share yet in
        # spirit, even though the token exists from creation) — treat as 404
        # rather than leaking draft content.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposal not found")
    agency = await db.get(Agency, proposal.agency_id)
    assert agency is not None
    proposal = await record_view(db, proposal)
    return proposal, agency
