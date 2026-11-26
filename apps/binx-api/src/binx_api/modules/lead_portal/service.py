"""Service layer for lead portals (see models.py)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.core.config import get_settings
from binx_api.core.security import generate_opaque_token
from binx_api.modules.agencies.models import Agency, AgencyProfile
from binx_api.modules.billing import service as billing_service
from binx_api.modules.billing.models import PLAN_STARTER
from binx_api.modules.lead_portal.models import AUTHOR_AGENCY, AUTHOR_LEAD, LeadPortal, LeadPortalMessage
from binx_api.modules.leads.models import Lead, LeadEvent
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_TEAM
from binx_api.modules.proposals.models import STATUS_DRAFT, Proposal
from binx_api.modules.users.models import User

settings = get_settings()

# Lead portals are a paid feature, same gate as custom subdomains.
LEAD_PORTAL_MIN_PLAN = PLAN_STARTER

EVENT_PORTAL_MESSAGE = "portal_message"


def portal_url(portal: LeadPortal) -> str:
    return f"{settings.frontend_url}/lead-portal?token={portal.token}"


async def get_portal(db: AsyncSession, lead_id: uuid.UUID) -> LeadPortal | None:
    return await db.scalar(select(LeadPortal).where(LeadPortal.lead_id == lead_id))


async def list_messages(db: AsyncSession, lead_id: uuid.UUID) -> list[LeadPortalMessage]:
    result = await db.execute(
        select(LeadPortalMessage)
        .where(LeadPortalMessage.lead_id == lead_id)
        .order_by(LeadPortalMessage.created_at, LeadPortalMessage.id)
    )
    return list(result.scalars().all())


async def enable_portal(
    db: AsyncSession, agency: Agency, lead: Lead, *, actor: User, welcome_message: str | None
) -> LeadPortal:
    """Turns the portal on (creating it the first time) and sets the welcome
    note. Starter plan and above."""
    if not await billing_service.agency_plan_at_least(db, agency.id, LEAD_PORTAL_MIN_PLAN):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Lead portals are on the Starter plan and above. Upgrade in Settings → Plan.",
        )
    portal = await get_portal(db, lead.id)
    if portal is None:
        portal = LeadPortal(lead_id=lead.id, agency_id=agency.id, token=generate_opaque_token(), created_by_id=actor.id)
        db.add(portal)
    portal.enabled = True
    portal.welcome_message = (welcome_message or "").strip() or None
    await db.commit()
    await db.refresh(portal)
    return portal


async def disable_portal(db: AsyncSession, lead: Lead) -> None:
    portal = await get_portal(db, lead.id)
    if portal is not None:
        portal.enabled = False
        await db.commit()


async def reset_link(db: AsyncSession, lead: Lead) -> LeadPortal:
    """A new link; the old one stops working at once."""
    portal = await get_portal(db, lead.id)
    if portal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This lead has no portal yet")
    portal.token = generate_opaque_token()
    await db.commit()
    await db.refresh(portal)
    return portal


async def get_public(db: AsyncSession, token: str) -> tuple[LeadPortal, Lead, Agency]:
    """The portal behind a link, if it's on, its agency isn't on its deletion
    hold, and the agency is still on a plan that includes lead portals."""
    row = (
        await db.execute(
            select(LeadPortal, Lead, Agency)
            .join(Lead, Lead.id == LeadPortal.lead_id)
            .join(Agency, Agency.id == LeadPortal.agency_id)
            .where(
                LeadPortal.token == token,
                LeadPortal.enabled.is_(True),
                Agency.deletion_scheduled_for.is_(None),
            )
        )
    ).first()
    if row is None or not await billing_service.agency_plan_at_least(db, row[2].id, LEAD_PORTAL_MIN_PLAN):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This page isn't available")
    return row[0], row[1], row[2]


async def record_view(db: AsyncSession, portal: LeadPortal) -> None:
    portal.last_viewed_at = datetime.now(UTC)
    await db.commit()


async def public_proposals(db: AsyncSession, lead: Lead) -> list[Proposal]:
    result = await db.execute(
        select(Proposal)
        .where(Proposal.lead_id == lead.id, Proposal.status != STATUS_DRAFT)
        .order_by(Proposal.sent_at.desc().nulls_last(), Proposal.created_at.desc())
    )
    return list(result.scalars().all())


async def agency_branding(db: AsyncSession, agency: Agency) -> AgencyProfile | None:
    return await db.scalar(select(AgencyProfile).where(AgencyProfile.agency_id == agency.id))


async def post_lead_message(
    db: AsyncSession, portal: LeadPortal, lead: Lead, *, body: str, author_name: str | None
) -> LeadPortalMessage:
    """A question from the lead. Tells the lead's owner, and logs it on the
    lead's timeline."""
    name = (author_name or "").strip() or lead.contact_name or lead.name
    # Stamped here, not by the database's CURRENT_TIMESTAMP (the transaction's
    # start), so a thread always reads in the order it was written.
    message = LeadPortalMessage(
        lead_id=lead.id,
        author_kind=AUTHOR_LEAD,
        author_name=name[:255],
        body=body.strip(),
        created_at=datetime.now(UTC),
    )
    db.add(message)
    db.add(
        LeadEvent(
            lead_id=lead.id,
            kind=EVENT_PORTAL_MESSAGE,
            body=f"{name} asked in their lead portal: {body.strip()[:280]}",
            actor_name=name[:255],
        )
    )
    lead.last_activity_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)

    recipient = lead.owner_id or portal.created_by_id
    if recipient is not None:
        await notifications_service.notify(
            db,
            user_id=recipient,
            category=CATEGORY_TEAM,
            event_type="lead_portal_message",
            title=f"{name} has a question about your proposal",
            body=body.strip()[:280],
            link=f"/leads/{lead.id}",
            agency_id=lead.agency_id,
        )
    return message


async def post_agency_reply(
    db: AsyncSession, agency: Agency, portal: LeadPortal, lead: Lead, *, body: str, actor: User
) -> LeadPortalMessage:
    """A reply from the team, emailed to the lead's contact with a link back."""
    message = LeadPortalMessage(
        lead_id=lead.id,
        author_kind=AUTHOR_AGENCY,
        author_user_id=actor.id,
        author_name=actor.full_name,
        body=body.strip(),
        created_at=datetime.now(UTC),
    )
    db.add(message)
    lead.last_activity_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)
    if lead.contact_email and portal.enabled:
        await email_service.send_lead_portal_reply_email(
            to=lead.contact_email,
            agency_name=agency.name,
            replier_name=actor.full_name,
            body=body.strip(),
            portal_url=portal_url(portal),
        )
    return message
