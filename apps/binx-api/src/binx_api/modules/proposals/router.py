import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.proposals import service
from binx_api.modules.proposals.models import Proposal, ProposalLineItem
from binx_api.modules.proposals.schemas import (
    ProposalCreate,
    ProposalDeclineRequest,
    ProposalDetailRead,
    ProposalLineItemRead,
    ProposalPublicRead,
    ProposalRead,
    ProposalSignatureRead,
    ProposalSignRequest,
    ProposalUpdate,
    SendProposalRequest,
)

router = APIRouter(prefix="/agencies/{agency_id}/proposals", tags=["proposals"])
public_router = APIRouter(prefix="/proposals/public", tags=["proposals"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def _line_item_read(item: ProposalLineItem) -> ProposalLineItemRead:
    return ProposalLineItemRead(
        id=item.id,
        position=item.position,
        description=item.description,
        quantity=item.quantity,
        unit_price_cents=item.unit_price_cents,
        amount_cents=item.amount_cents,
    )


def _read(proposal: Proposal, lead_name: str | None, client_name: str | None) -> ProposalRead:
    return ProposalRead(
        id=proposal.id,
        agency_id=proposal.agency_id,
        lead_id=proposal.lead_id,
        client_id=proposal.client_id,
        lead_name=lead_name,
        client_name=client_name,
        title=proposal.title,
        recipient_name=proposal.recipient_name,
        recipient_email=proposal.recipient_email,
        status=proposal.status,
        display_status=service.display_status(proposal),
        currency=proposal.currency,
        subtotal_cents=proposal.subtotal_cents,
        tax_cents=proposal.tax_cents,
        total_cents=proposal.total_cents,
        valid_until=proposal.valid_until,
        sent_at=proposal.sent_at,
        created_at=proposal.created_at,
    )


async def _detail_read(
    db: DbSession, proposal: Proposal, lead_name: str | None, client_name: str | None
) -> ProposalDetailRead:
    base = _read(proposal, lead_name, client_name)
    line_items = await service.list_line_items(db, proposal.id)
    signature = await service.get_signature(db, proposal.id)
    return ProposalDetailRead(
        **base.model_dump(),
        content=proposal.content,
        tax_rate_percent=proposal.tax_rate_percent,
        viewed_at=proposal.viewed_at,
        decided_at=proposal.decided_at,
        decline_reason=proposal.decline_reason,
        share_url=service.share_url(proposal),
        line_items=[_line_item_read(item) for item in line_items],
        signature=(
            ProposalSignatureRead(
                signer_name=signature.signer_name, signer_email=signature.signer_email, signed_at=signature.signed_at
            )
            if signature
            else None
        ),
    )


async def _names(db: DbSession, proposal: Proposal) -> tuple[str | None, str | None]:
    from binx_api.modules.agencies.models import AgencyClient
    from binx_api.modules.leads.models import Lead

    lead_name = None
    client_name = None
    if proposal.lead_id is not None:
        lead = await db.get(Lead, proposal.lead_id)
        lead_name = lead.name if lead else None
    if proposal.client_id is not None:
        client = await db.get(AgencyClient, proposal.client_id)
        client_name = client.name if client else None
    return lead_name, client_name


# ---- Staff CRUD -----------------------------------------------------------


@router.get("", response_model=list[ProposalRead])
async def list_proposals(
    db: DbSession,
    agency_and_role: AnyMember,
    lead_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[ProposalRead]:
    agency, _role = agency_and_role
    rows = await service.list_proposals(
        db, agency.id, lead_id=lead_id, client_id=client_id, status_filter=status_filter
    )
    return [_read(proposal, lead_name, client_name) for proposal, lead_name, client_name in rows]


@router.post("", response_model=ProposalDetailRead, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: ProposalCreate
) -> ProposalDetailRead:
    agency, _role = agency_and_role
    proposal = await service.create_proposal(
        db,
        agency,
        created_by=current_user,
        lead_id=data.lead_id,
        client_id=data.client_id,
        title=data.title,
        recipient_name=data.recipient_name,
        recipient_email=data.recipient_email,
        content=data.content,
        currency=data.currency,
        tax_rate_percent=data.tax_rate_percent,
        valid_until=data.valid_until,
        line_items=data.line_items,
    )
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


@router.get("/{proposal_id}", response_model=ProposalDetailRead)
async def read_proposal(db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID) -> ProposalDetailRead:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


@router.patch("/{proposal_id}", response_model=ProposalDetailRead)
async def update_proposal(
    db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID, data: ProposalUpdate
) -> ProposalDetailRead:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    proposal = await service.update_proposal(
        db,
        proposal,
        lead_id=data.lead_id,
        client_id=data.client_id,
        title=data.title,
        recipient_name=data.recipient_name,
        recipient_email=data.recipient_email,
        content=data.content,
        currency=data.currency,
        tax_rate_percent=data.tax_rate_percent,
        valid_until=data.valid_until,
        line_items=data.line_items,
    )
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proposal(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, proposal_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    await service.delete_proposal(db, proposal, actor=current_user)


@router.post("/{proposal_id}/send", response_model=ProposalDetailRead)
async def send_proposal(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    proposal_id: uuid.UUID,
    data: SendProposalRequest,
) -> ProposalDetailRead:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    proposal = await service.send_proposal(db, proposal, sent_by=current_user, recipient_email=data.recipient_email)
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


# ---- Public (unauthenticated, token-scoped) -------------------------------


@public_router.get("/{token}", response_model=ProposalPublicRead)
async def read_public_proposal(db: DbSession, token: str) -> ProposalPublicRead:
    proposal, agency = await service.get_public_proposal(db, token)
    line_items = await service.list_line_items(db, proposal.id)
    signature = await service.get_signature(db, proposal.id)
    return ProposalPublicRead(
        agency_name=agency.name,
        title=proposal.title,
        recipient_name=proposal.recipient_name,
        status=proposal.status,
        display_status=service.display_status(proposal),
        content=proposal.content,
        currency=proposal.currency,
        tax_rate_percent=proposal.tax_rate_percent,
        subtotal_cents=proposal.subtotal_cents,
        tax_cents=proposal.tax_cents,
        total_cents=proposal.total_cents,
        valid_until=proposal.valid_until,
        line_items=[_line_item_read(item) for item in line_items],
        signature=(
            ProposalSignatureRead(
                signer_name=signature.signer_name, signer_email=signature.signer_email, signed_at=signature.signed_at
            )
            if signature
            else None
        ),
    )


@public_router.post("/{token}/sign", response_model=ProposalPublicRead)
async def sign_public_proposal(
    db: DbSession, token: str, data: ProposalSignRequest, request: Request
) -> ProposalPublicRead:
    proposal = await service.get_proposal_by_token_or_404(db, token)
    proposal = await service.sign_proposal(
        db,
        proposal,
        signer_name=data.signer_name,
        signer_email=data.signer_email,
        ip_address=request.client.host if request.client else None,
    )
    return await read_public_proposal(db, token)


@public_router.post("/{token}/decline", response_model=ProposalPublicRead)
async def decline_public_proposal(db: DbSession, token: str, data: ProposalDeclineRequest) -> ProposalPublicRead:
    proposal = await service.get_proposal_by_token_or_404(db, token)
    await service.decline_proposal(db, proposal, reason=data.reason)
    return await read_public_proposal(db, token)
