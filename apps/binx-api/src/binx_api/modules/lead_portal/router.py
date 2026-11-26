import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response

from binx_api.core import storage
from binx_api.core.config import get_settings
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.rate_limit import limiter
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.lead_portal import service
from binx_api.modules.lead_portal.models import LeadPortal, LeadPortalMessage
from binx_api.modules.lead_portal.schemas import (
    LeadPortalMessageCreate,
    LeadPortalMessageRead,
    LeadPortalRead,
    LeadPortalUpdate,
    PublicLeadPortalMessageCreate,
    PublicLeadPortalProposal,
    PublicLeadPortalRead,
)
from binx_api.modules.leads import service as leads_service
from binx_api.modules.proposals import service as proposals_service

settings = get_settings()

router = APIRouter(prefix="/agencies/{agency_id}/leads/{lead_id}/portal", tags=["lead-portal"])
public_router = APIRouter(prefix="/lead-portal", tags=["lead-portal"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def _message_read(message: LeadPortalMessage) -> LeadPortalMessageRead:
    return LeadPortalMessageRead(
        id=message.id,
        author_kind=message.author_kind,
        author_name=message.author_name,
        body=message.body,
        created_at=message.created_at,
    )


async def _staff_read(db: DbSession, lead_id: uuid.UUID, portal: LeadPortal | None) -> LeadPortalRead:
    messages = await service.list_messages(db, lead_id)
    return LeadPortalRead(
        enabled=bool(portal and portal.enabled),
        url=service.portal_url(portal) if portal and portal.enabled else None,
        welcome_message=portal.welcome_message if portal else None,
        last_viewed_at=portal.last_viewed_at if portal else None,
        messages=[_message_read(m) for m in messages],
    )


# ---- Staff ------------------------------------------------------------------------


@router.get("", response_model=LeadPortalRead)
async def read_portal(db: DbSession, agency_and_role: AnyMember, lead_id: uuid.UUID) -> LeadPortalRead:
    agency, _role = agency_and_role
    lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    return await _staff_read(db, lead.id, await service.get_portal(db, lead.id))


@router.put("", response_model=LeadPortalRead)
async def enable_portal(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, lead_id: uuid.UUID, data: LeadPortalUpdate
) -> LeadPortalRead:
    agency, _role = agency_and_role
    lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    portal = await service.enable_portal(db, agency, lead, actor=current_user, welcome_message=data.welcome_message)
    return await _staff_read(db, lead.id, portal)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def disable_portal(db: DbSession, agency_and_role: AnyMember, lead_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    await service.disable_portal(db, lead)


@router.post("/reset-link", response_model=LeadPortalRead)
async def reset_link(db: DbSession, agency_and_role: AnyMember, lead_id: uuid.UUID) -> LeadPortalRead:
    agency, _role = agency_and_role
    lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    return await _staff_read(db, lead.id, await service.reset_link(db, lead))


@router.post("/messages", response_model=LeadPortalMessageRead, status_code=status.HTTP_201_CREATED)
async def reply(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    lead_id: uuid.UUID,
    data: LeadPortalMessageCreate,
) -> LeadPortalMessageRead:
    agency, _role = agency_and_role
    lead = await leads_service.get_lead_or_404(db, agency.id, lead_id)
    portal = await service.get_portal(db, lead.id)
    if portal is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Turn on this lead's portal first")
    message = await service.post_agency_reply(db, agency, portal, lead, body=data.body, actor=current_user)
    return _message_read(message)


# ---- Public (the lead, by link) ---------------------------------------------------


@public_router.get("/{token}", response_model=PublicLeadPortalRead)
async def read_public_portal(db: DbSession, token: str) -> PublicLeadPortalRead:
    portal, lead, agency = await service.get_public(db, token)
    await service.record_view(db, portal)
    profile = await service.agency_branding(db, agency)
    proposals = await service.public_proposals(db, lead)
    messages = await service.list_messages(db, lead.id)
    return PublicLeadPortalRead(
        agency_name=agency.name,
        brand_color=profile.brand_color if profile else None,
        has_logo=bool(profile and profile.logo_storage_path),
        lead_name=lead.name,
        contact_name=lead.contact_name,
        welcome_message=portal.welcome_message,
        proposals=[
            PublicLeadPortalProposal(
                title=proposal.title,
                display_status=proposals_service.display_status(proposal),
                currency=proposal.currency,
                total_cents=proposal.total_cents,
                monthly_total_cents=proposal.monthly_total_cents,
                valid_until=proposal.valid_until,
                sent_at=proposal.sent_at,
                url=proposals_service.share_url(proposal),
            )
            for proposal in proposals
        ],
        messages=[_message_read(m) for m in messages],
        is_client=lead.converted_client_id is not None,
        portal_login_url=f"{settings.frontend_url}/portal/login",
    )


@public_router.post("/{token}/messages", response_model=LeadPortalMessageRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def ask(
    request: Request, db: DbSession, token: str, data: PublicLeadPortalMessageCreate
) -> LeadPortalMessageRead:
    portal, lead, _agency = await service.get_public(db, token)
    message = await service.post_lead_message(db, portal, lead, body=data.body, author_name=data.author_name)
    return _message_read(message)


@public_router.get("/{token}/logo")
async def public_logo(db: DbSession, token: str) -> Response:
    _portal, _lead, agency = await service.get_public(db, token)
    profile = await service.agency_branding(db, agency)
    if profile is None or not profile.logo_storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No logo")
    return await storage.response(profile.logo_storage_path, media_type=profile.logo_mime_type or "image/png")
