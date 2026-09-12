"""Client-portal service: the client-contact invitation flow (mirrors
agencies/service.py's invitation half) plus the read helpers that back the
`/portal` router. Reuses the projects / invoicing / messaging services wholesale
— a client contact is a real `User`, so the only thing that differs is the
access scope (one AgencyClient) rather than agency membership.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.security import generate_opaque_token, hash_token
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_CLIENTS
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.agencies.service import (
    _image_version,
    get_or_create_agency_profile,
    get_or_create_client_branding,
)
from binx_api.modules.client_portal.models import (
    CONTACT_INVITATION_ACCEPTED,
    CONTACT_INVITATION_PENDING,
    CONTACT_INVITATION_REVOKED,
    ClientContact,
    ClientInvitation,
)
from binx_api.modules.client_portal.schemas import (
    PortalAgencyRead,
    PortalBoardColumn,
    PortalClientRead,
    PortalProgress,
)
from binx_api.modules.invoicing.service import get_or_create_billing_settings
from binx_api.modules.messaging.models import Conversation, ConversationParticipant
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_TEAM as NOTIFY_CATEGORY_TEAM
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList
from binx_api.modules.users.models import User

INVITATION_EXPIRE_DAYS = 7


# ---- Branding read model -------------------------------------------------


async def portal_agency_read(db: AsyncSession, agency: Agency) -> PortalAgencyRead:
    profile = await get_or_create_agency_profile(db, agency)
    billing_settings = await get_or_create_billing_settings(db, agency)
    return PortalAgencyRead(
        id=agency.id,
        name=agency.name,
        has_logo=profile.logo_storage_path is not None,
        logo_version=_image_version(profile.logo_storage_path),
        brand_color=profile.brand_color,
        stripe_charges_enabled=billing_settings.stripe_connect_charges_enabled,
    )


# ---- Contacts ----------------------------------------------------------


async def list_client_contacts(db: AsyncSession, client_id: uuid.UUID) -> list[tuple[ClientContact, User]]:
    result = await db.execute(
        select(ClientContact, User)
        .join(User, User.id == ClientContact.user_id)
        .where(ClientContact.client_id == client_id)
        .order_by(ClientContact.created_at)
    )
    return [(contact, user) for contact, user in result.all()]


async def get_portal_memberships(db: AsyncSession, user: User) -> list[tuple[Agency, AgencyClient, ClientContact]]:
    """Every (agency, client) the signed-in user has portal access to."""
    result = await db.execute(
        select(Agency, AgencyClient, ClientContact)
        .join(ClientContact, ClientContact.agency_id == Agency.id)
        .join(AgencyClient, AgencyClient.id == ClientContact.client_id)
        .where(ClientContact.user_id == user.id)
        .order_by(ClientContact.created_at)
    )
    return [(agency, client, contact) for agency, client, contact in result.all()]


async def get_contact_or_404(db: AsyncSession, client_id: uuid.UUID, contact_id: uuid.UUID) -> ClientContact:
    result = await db.execute(
        select(ClientContact).where(ClientContact.id == contact_id, ClientContact.client_id == client_id)
    )
    contact = result.scalar_one_or_none()
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return contact


async def remove_client_contact(db: AsyncSession, contact: ClientContact) -> None:
    await db.delete(contact)
    await db.commit()


async def _is_already_contact(db: AsyncSession, client_id: uuid.UUID, email: str) -> bool:
    result = await db.execute(
        select(ClientContact.id)
        .join(User, User.id == ClientContact.user_id)
        .where(ClientContact.client_id == client_id, func.lower(User.email) == email.lower())
    )
    return result.scalar_one_or_none() is not None


# ---- Invitations (mirror agencies/service.py) -------------------------


async def create_client_invitation(
    db: AsyncSession, agency: Agency, client: AgencyClient, *, email: str, invited_by: User
) -> tuple[ClientInvitation, str]:
    if await _is_already_contact(db, client.id, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "That person is already a portal contact for this client")

    result = await db.execute(
        select(ClientInvitation).where(
            ClientInvitation.client_id == client.id,
            func.lower(ClientInvitation.email) == email.lower(),
            ClientInvitation.status == CONTACT_INVITATION_PENDING,
        )
    )
    invitation = result.scalar_one_or_none()

    raw_token = generate_opaque_token()
    expires_at = datetime.now(UTC) + timedelta(days=INVITATION_EXPIRE_DAYS)

    if invitation is None:
        invitation = ClientInvitation(
            agency_id=agency.id,
            client_id=client.id,
            email=email,
            invited_by_id=invited_by.id,
            token_hash=hash_token(raw_token),
            status=CONTACT_INVITATION_PENDING,
            expires_at=expires_at,
        )
        db.add(invitation)
    else:
        invitation.invited_by_id = invited_by.id
        invitation.token_hash = hash_token(raw_token)
        invitation.expires_at = expires_at

    await db.commit()
    await db.refresh(invitation)
    return invitation, raw_token


async def list_client_invitations(
    db: AsyncSession, client_id: uuid.UUID, *, include_all: bool = False
) -> list[tuple[ClientInvitation, User]]:
    query = (
        select(ClientInvitation, User)
        .join(User, User.id == ClientInvitation.invited_by_id)
        .where(ClientInvitation.client_id == client_id)
        .order_by(ClientInvitation.created_at.desc())
    )
    if not include_all:
        query = query.where(ClientInvitation.status == CONTACT_INVITATION_PENDING)
    result = await db.execute(query)
    return [(invitation, inviter) for invitation, inviter in result.all()]


async def get_client_invitation_or_404(
    db: AsyncSession, client_id: uuid.UUID, invitation_id: uuid.UUID
) -> ClientInvitation:
    result = await db.execute(
        select(ClientInvitation).where(ClientInvitation.id == invitation_id, ClientInvitation.client_id == client_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation


async def resend_client_invitation(
    db: AsyncSession, agency: Agency, client: AgencyClient, invitation: ClientInvitation, *, invited_by: User
) -> tuple[ClientInvitation, str]:
    if invitation.status != CONTACT_INVITATION_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a pending invitation can be resent")
    return await create_client_invitation(db, agency, client, email=invitation.email, invited_by=invited_by)


async def revoke_client_invitation(db: AsyncSession, invitation: ClientInvitation) -> None:
    invitation.status = CONTACT_INVITATION_REVOKED
    await db.commit()


async def _get_valid_client_invitation(db: AsyncSession, raw_token: str) -> ClientInvitation:
    result = await db.execute(select(ClientInvitation).where(ClientInvitation.token_hash == hash_token(raw_token)))
    invitation = result.scalar_one_or_none()
    if (
        invitation is None
        or invitation.status != CONTACT_INVITATION_PENDING
        or invitation.expires_at < datetime.now(UTC)
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invitation link is invalid or has expired")
    return invitation


async def preview_client_invitation(
    db: AsyncSession, raw_token: str
) -> tuple[ClientInvitation, Agency, AgencyClient, User]:
    invitation = await _get_valid_client_invitation(db, raw_token)
    agency = await db.get(Agency, invitation.agency_id)
    client = await db.get(AgencyClient, invitation.client_id)
    inviter = await db.get(User, invitation.invited_by_id)
    assert agency is not None and client is not None and inviter is not None
    return invitation, agency, client, inviter


async def accept_client_invitation(
    db: AsyncSession, raw_token: str, *, accepting_user: User
) -> tuple[Agency, AgencyClient, ClientContact]:
    invitation = await _get_valid_client_invitation(db, raw_token)

    if invitation.email.lower() != accepting_user.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This invitation was sent to a different email address")

    existing = await db.execute(
        select(ClientContact).where(
            ClientContact.client_id == invitation.client_id, ClientContact.user_id == accepting_user.id
        )
    )
    contact = existing.scalar_one_or_none()
    if contact is None:
        has_primary = await db.execute(
            select(ClientContact.id).where(ClientContact.client_id == invitation.client_id).limit(1)
        )
        contact = ClientContact(
            agency_id=invitation.agency_id,
            client_id=invitation.client_id,
            user_id=accepting_user.id,
            is_primary=has_primary.scalar_one_or_none() is None,
        )
        db.add(contact)

    invitation.status = CONTACT_INVITATION_ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(contact)

    # Pull the new contact into every conversation already linked to this client.
    await _join_client_conversations(db, invitation.client_id, accepting_user.id)

    agency = await db.get(Agency, invitation.agency_id)
    client = await db.get(AgencyClient, invitation.client_id)
    assert agency is not None and client is not None

    # Post-commit feed writes (see the cross-cutting-event-feeds memory).
    await notifications_service.notify(
        db,
        user_id=invitation.invited_by_id,
        category=NOTIFY_CATEGORY_TEAM,
        event_type="portal_contact_joined",
        title=f"{accepting_user.full_name} joined {client.name}'s portal",
        body="They accepted your invitation and can now see projects, invoices and messages.",
        link=f"/clients/{client.id}/settings",
        agency_id=agency.id,
        actor=accepting_user,
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_CLIENTS,
        event_type="portal_contact_joined",
        summary=f"{accepting_user.full_name} joined {client.name}'s client portal",
        actor=accepting_user,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
    return agency, client, contact


async def _join_client_conversations(db: AsyncSession, client_id: uuid.UUID, user_id: uuid.UUID) -> None:
    convo_ids = (await db.execute(select(Conversation.id).where(Conversation.client_id == client_id))).scalars().all()
    if not convo_ids:
        return
    already = set(
        (
            await db.execute(
                select(ConversationParticipant.conversation_id).where(
                    ConversationParticipant.conversation_id.in_(convo_ids),
                    ConversationParticipant.user_id == user_id,
                )
            )
        )
        .scalars()
        .all()
    )
    for cid in convo_ids:
        if cid not in already:
            db.add(ConversationParticipant(conversation_id=cid, user_id=user_id))
    await db.commit()


# ---- Portal reads: projects + progress -------------------------------


def _progress(total: int, done: int) -> PortalProgress:
    percent = round(done / total * 100) if total else 0
    return PortalProgress(total_tasks=total, done_tasks=done, percent=percent)


async def _project_progress(db: AsyncSession, project_id: uuid.UUID) -> tuple[PortalProgress, list[PortalBoardColumn]]:
    lists = (
        (
            await db.execute(
                select(ProjectTaskList)
                .where(ProjectTaskList.project_id == project_id)
                .order_by(ProjectTaskList.position)
            )
        )
        .scalars()
        .all()
    )
    counts = dict(
        (
            await db.execute(
                select(ProjectTask.list_id, func.count())
                .where(ProjectTask.project_id == project_id)
                .group_by(ProjectTask.list_id)
            )
        ).all()
    )
    columns = [
        PortalBoardColumn(name=lst.name, position=lst.position, task_count=counts.get(lst.id, 0)) for lst in lists
    ]
    total = sum(c.task_count for c in columns)
    # "Done" = whatever sits in the final column (its position is implicit status).
    done = columns[-1].task_count if columns else 0
    return _progress(total, done), columns


async def list_portal_projects(db: AsyncSession, client_id: uuid.UUID) -> list[tuple[Project, PortalProgress]]:
    projects = (
        (await db.execute(select(Project).where(Project.client_id == client_id).order_by(Project.created_at.desc())))
        .scalars()
        .all()
    )
    out: list[tuple[Project, PortalProgress]] = []
    for project in projects:
        progress, _columns = await _project_progress(db, project.id)
        out.append((project, progress))
    return out


async def get_portal_project_or_404(db: AsyncSession, client_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.client_id == client_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def portal_project_detail(db: AsyncSession, project: Project) -> tuple[PortalProgress, list[PortalBoardColumn]]:
    return await _project_progress(db, project.id)


async def portal_client_read(db: AsyncSession, client: AgencyClient) -> PortalClientRead:
    branding = await get_or_create_client_branding(db, client)
    return PortalClientRead(
        id=client.id,
        name=client.name,
        has_logo=branding.logo_storage_path is not None,
        logo_version=_image_version(branding.logo_storage_path),
        primary_color=branding.primary_color,
        accent_color=branding.accent_color,
        welcome_message=branding.welcome_message,
    )


async def portal_logo_path(db: AsyncSession, agency: Agency, client: AgencyClient) -> tuple[str, str] | None:
    """The (storage_path, mime_type) for the client's own logo, or the
    agency's own as a fallback — whichever `GET /portal/logo` should stream.
    None when neither is set."""
    branding = await get_or_create_client_branding(db, client)
    if branding.logo_storage_path:
        return branding.logo_storage_path, branding.logo_mime_type or "image/png"
    profile = await get_or_create_agency_profile(db, agency)
    if profile.logo_storage_path:
        return profile.logo_storage_path, profile.logo_mime_type or "image/png"
    return None
