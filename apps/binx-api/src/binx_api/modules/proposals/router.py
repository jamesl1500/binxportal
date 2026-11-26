import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status

from binx_api.core import storage
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.rate_limit import client_ip, client_user_agent
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.proposals import acceptance as acceptance_service
from binx_api.modules.proposals import service, signing
from binx_api.modules.proposals.certificate_pdf import certificate_file_name, render_certificate_pdf
from binx_api.modules.proposals.models import (
    STATUS_DRAFT,
    Proposal,
    ProposalAttachment,
    ProposalLineItem,
    ProposalSignature,
)
from binx_api.modules.proposals.schemas import (
    CountersignRequest,
    ProposalAcceptanceRead,
    ProposalAttachmentRead,
    ProposalCertificateRead,
    ProposalCreate,
    ProposalDeclineRequest,
    ProposalDetailRead,
    ProposalEventRead,
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
OwnerOrAdmin = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _line_item_read(item: ProposalLineItem) -> ProposalLineItemRead:
    return ProposalLineItemRead(
        id=item.id,
        position=item.position,
        description=item.description,
        details=item.details,
        quantity=item.quantity,
        unit_price_cents=item.unit_price_cents,
        amount_cents=item.amount_cents,
        service_id=item.service_id,
    )


def attachment_read(attachment: ProposalAttachment) -> ProposalAttachmentRead:
    return ProposalAttachmentRead(
        id=attachment.id,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size=attachment.size,
        sha256=attachment.sha256,
        created_at=attachment.created_at,
    )


async def attachment_download(attachment: ProposalAttachment):
    return await storage.response(
        attachment.storage_path, filename=attachment.file_name, media_type=attachment.mime_type
    )


def signature_read(signature: ProposalSignature | None) -> ProposalSignatureRead | None:
    if signature is None:
        return None
    return ProposalSignatureRead(
        signer_name=signature.signer_name,
        signer_email=signature.signer_email,
        signed_at=signature.signed_at,
        signed_via=signature.signed_via,
    )


async def signing_fields(db: DbSession, proposal: Proposal) -> dict:
    """The e-sign fields every proposal read carries."""
    counter = await service.get_countersignature(db, proposal.id)
    return {
        "document_hash": proposal.document_hash,
        "consent_text": signing.CONSENT_TEXT,
        "consent_version": signing.CONSENT_VERSION,
        "requires_countersign": proposal.requires_countersign,
        "countersignature": (
            ProposalSignatureRead(
                signer_name=counter.signer_name,
                signer_email=counter.signer_email,
                signed_at=counter.signed_at,
                signed_via="agency",
            )
            if counter
            else None
        ),
        "completed_at": proposal.completed_at,
    }


async def certificate_pdf_response(db: DbSession, proposal: Proposal) -> Response:
    """The signing certificate as a PDF download (409 until signed)."""
    certificate = await signing.build_certificate(db, proposal)
    name = certificate_file_name(certificate).replace('"', "")
    return Response(
        content=render_certificate_pdf(certificate),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
        },
    )


def link_visitor(request: Request) -> service.Visitor:
    """The share-link recipient: no account, so the trail names the link."""
    return service.Visitor(
        ip_address=client_ip(request), user_agent=client_user_agent(request), label="Recipient (share link)"
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
    db: DbSession,
    proposal: Proposal,
    lead_name: str | None,
    client_name: str | None,
    *,
    include_acceptance: bool = True,
) -> ProposalDetailRead:
    base = _read(proposal, lead_name, client_name)
    line_items = await service.list_line_items(db, proposal.id)
    attachments = await service.list_attachments(db, proposal.id)
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
        attachments=[attachment_read(item) for item in attachments],
        signature=signature_read(signature),
        **(await signing_fields(db, proposal)),
        deposit_percent=proposal.deposit_percent,
        create_project_on_accept=proposal.create_project_on_accept,
        kickoff_template_id=proposal.kickoff_template_id,
        acceptance=await acceptance_read(db, proposal) if include_acceptance else None,
    )


async def acceptance_read(db: DbSession, proposal: Proposal) -> ProposalAcceptanceRead | None:
    from binx_api.modules.agencies.models import AgencyClient
    from binx_api.modules.invoicing.models import Invoice
    from binx_api.modules.projects.models import Project

    row = await acceptance_service.get_acceptance(db, proposal.id)
    if row is None:
        return None
    client = await db.get(AgencyClient, row.client_id) if row.client_id else None
    invoice = await db.get(Invoice, row.deposit_invoice_id) if row.deposit_invoice_id else None
    project = await db.get(Project, row.project_id) if row.project_id else None
    return ProposalAcceptanceRead(
        status=row.status,
        blocked_reason=row.blocked_reason,
        client_id=row.client_id,
        client_name=client.name if client else None,
        converted_lead=row.converted_lead,
        invited_email=row.invited_email,
        deposit_invoice_id=row.deposit_invoice_id,
        deposit_invoice_number=invoice.number if invoice else None,
        deposit_invoice_status=invoice.status if invoice else None,
        deposit_paid_at=row.deposit_paid_at,
        project_id=row.project_id,
        project_name=project.name if project else None,
        kickoff_sent_at=row.kickoff_sent_at,
        completed_at=row.completed_at,
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
        requires_countersign=data.requires_countersign,
        deposit_percent=data.deposit_percent,
        create_project_on_accept=data.create_project_on_accept,
        kickoff_template_id=data.kickoff_template_id,
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
        requires_countersign=data.requires_countersign,
        deposit_percent=data.deposit_percent,
        create_project_on_accept=data.create_project_on_accept,
        kickoff_template_id=data.kickoff_template_id,
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


@router.get("/{proposal_id}/events", response_model=list[ProposalEventRead])
async def list_proposal_events(
    db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID
) -> list[ProposalEventRead]:
    """The audit trail: sent, every view, signed or declined, with where
    each came from. Staff only."""
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    return [signing.event_read(event) for event in await signing.list_events(db, proposal.id)]


@router.get("/{proposal_id}/certificate", response_model=ProposalCertificateRead)
async def proposal_certificate(
    db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID
) -> ProposalCertificateRead:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    return await signing.build_certificate(db, proposal)


@router.get("/{proposal_id}/certificate.pdf")
async def proposal_certificate_pdf(db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID) -> Response:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    return await certificate_pdf_response(db, proposal)


@router.post("/{proposal_id}/acceptance/retry", response_model=ProposalDetailRead)
async def retry_acceptance(db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID) -> ProposalDetailRead:
    """Re-runs a blocked acceptance (after upgrading the plan, say). Picks
    up where it stopped; finished steps aren't repeated."""
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    if proposal.completed_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal isn't fully signed yet")
    await acceptance_service.accept(db, proposal)
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


@router.post("/{proposal_id}/countersign", response_model=ProposalDetailRead)
async def countersign_proposal(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: OwnerOrAdmin,
    proposal_id: uuid.UUID,
    data: CountersignRequest,
    request: Request,
) -> ProposalDetailRead:
    """The agency's signature, after the client's. Owners and admins only:
    it binds the agency."""
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    proposal = await service.countersign_proposal(
        db,
        proposal,
        user=current_user,
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
        consent=data.consent,
        document_hash=data.document_hash,
    )
    lead_name, client_name = await _names(db, proposal)
    return await _detail_read(db, proposal, lead_name, client_name)


# ---- Attachments (staff) ----------------------------------------------------


@router.post("/{proposal_id}/attachments", response_model=ProposalAttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    proposal_id: uuid.UUID,
    file: Annotated[UploadFile, File()],
) -> ProposalAttachmentRead:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    attachment = await service.add_attachment(
        db,
        proposal,
        uploaded_by=current_user,
        file_name=file.filename,
        content=await file.read(),
        mime_type=file.content_type,
    )
    return attachment_read(attachment)


@router.delete("/{proposal_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID, attachment_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    attachment = await service.get_attachment_or_404(db, proposal.id, attachment_id)
    await service.remove_attachment(db, proposal, attachment)


@router.get("/{proposal_id}/attachments/{attachment_id}/download")
async def download_attachment(
    db: DbSession, agency_and_role: AnyMember, proposal_id: uuid.UUID, attachment_id: uuid.UUID
):
    agency, _role = agency_and_role
    proposal = await service.get_proposal_or_404(db, agency.id, proposal_id)
    attachment = await service.get_attachment_or_404(db, proposal.id, attachment_id)
    return await attachment_download(attachment)


# ---- Public (unauthenticated, token-scoped) -------------------------------


@public_router.get("/{token}", response_model=ProposalPublicRead)
async def read_public_proposal(db: DbSession, token: str, request: Request) -> ProposalPublicRead:
    proposal, agency = await service.get_public_proposal(db, token, link_visitor(request))
    return await _public_read(db, proposal, agency.name)


async def _public_read(db: DbSession, proposal: Proposal, agency_name: str) -> ProposalPublicRead:
    line_items = await service.list_line_items(db, proposal.id)
    attachments = await service.list_attachments(db, proposal.id)
    signature = await service.get_signature(db, proposal.id)
    return ProposalPublicRead(
        agency_name=agency_name,
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
        attachments=[attachment_read(item) for item in attachments],
        signature=signature_read(signature),
        **(await signing_fields(db, proposal)),
    )


async def _public_after_change(db: DbSession, proposal: Proposal) -> ProposalPublicRead:
    """The public read after a sign/decline, without logging another view."""
    from binx_api.modules.agencies.models import Agency

    agency = await db.get(Agency, proposal.agency_id)
    return await _public_read(db, proposal, agency.name if agency else "")


@public_router.get("/{token}/certificate", response_model=ProposalCertificateRead)
async def public_certificate(db: DbSession, token: str) -> ProposalCertificateRead:
    proposal = await service.get_proposal_by_token_or_404(db, token)
    return await signing.build_certificate(db, proposal)


@public_router.get("/{token}/certificate.pdf")
async def public_certificate_pdf(db: DbSession, token: str) -> Response:
    proposal = await service.get_proposal_by_token_or_404(db, token)
    return await certificate_pdf_response(db, proposal)


@public_router.get("/{token}/attachments/{attachment_id}")
async def download_public_attachment(db: DbSession, token: str, attachment_id: uuid.UUID):
    # Same gate as the public read (no drafts, no agency on its deletion
    # hold), but without recording a view: a download isn't a first look.
    proposal = await service.get_proposal_by_token_or_404(db, token)
    if proposal.status == STATUS_DRAFT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    attachment = await service.get_attachment_or_404(db, proposal.id, attachment_id)
    return await attachment_download(attachment)


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
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
        signed_via=service.SIGNED_VIA_LINK,
        consent=data.consent,
        document_hash=data.document_hash,
    )
    return await _public_after_change(db, proposal)


@public_router.post("/{token}/decline", response_model=ProposalPublicRead)
async def decline_public_proposal(
    db: DbSession, token: str, data: ProposalDeclineRequest, request: Request
) -> ProposalPublicRead:
    proposal = await service.get_proposal_by_token_or_404(db, token)
    proposal = await service.decline_proposal(db, proposal, reason=data.reason, visitor=link_visitor(request))
    return await _public_after_change(db, proposal)
