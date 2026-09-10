import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.email import (
    build_invite_accept_url,
    build_portal_invite_accept_url,
    send_agency_invitation_email,
    send_client_invitation_email,
)
from binx_api.modules.activity import models as activity_models
from binx_api.modules.activity import service as activity_service
from binx_api.modules.agencies import service
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency, AgencyProfile
from binx_api.modules.agencies.schemas import (
    AgencyClientCreate,
    AgencyClientRead,
    AgencyClientStatusUpdate,
    AgencyClientUpdate,
    AgencyCreate,
    AgencyInvitationAccept,
    AgencyInvitationCreate,
    AgencyInvitationPreview,
    AgencyInvitationRead,
    AgencyMemberDetailsUpdate,
    AgencyMemberRead,
    AgencyMemberRoleUpdate,
    AgencyProfileRead,
    AgencyProfileUpdate,
    AgencyRead,
    AgencyUpdate,
)
from binx_api.modules.client_portal import service as portal_service
from binx_api.modules.client_portal.schemas import (
    ClientContactInvitationCreate,
    ClientContactRead,
    ClientInvitationRead,
)
from binx_api.modules.users.models import User, UserPrivacySettings

router = APIRouter(prefix="/agencies", tags=["agencies"])

# (agency, caller's role in it) — what require_agency_role's dependency resolves to.
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]
OwnedAgency = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER))]
AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def _agency_read(agency: Agency, role: str, *, logo_storage_path: str | None = None) -> AgencyRead:
    return AgencyRead(
        id=agency.id,
        name=agency.name,
        slug=agency.slug,
        role=role,
        has_logo=logo_storage_path is not None,
        logo_version=service._image_version(logo_storage_path),
    )


def _profile_read(profile: AgencyProfile) -> AgencyProfileRead:
    return AgencyProfileRead(
        agency_id=profile.agency_id,
        tagline=profile.tagline,
        brand_color=profile.brand_color,
        about=profile.about,
        founded_year=profile.founded_year,
        headquarters=profile.headquarters,
        contact_email=profile.contact_email,
        contact_phone=profile.contact_phone,
        website=profile.website,
        address=profile.address,
        linkedin_url=profile.linkedin_url,
        twitter_url=profile.twitter_url,
        instagram_url=profile.instagram_url,
        facebook_url=profile.facebook_url,
        terms_of_service=profile.terms_of_service,
        privacy_policy=profile.privacy_policy,
        working_policy=profile.working_policy,
        cancellation_policy=profile.cancellation_policy,
        has_logo=profile.logo_storage_path is not None,
        has_cover=profile.cover_storage_path is not None,
        logo_version=service._image_version(profile.logo_storage_path),
        cover_version=service._image_version(profile.cover_storage_path),
    )


_VISIBILITY_PRIVATE = "private"


def _member_read(member, user, privacy, *, caller_is_admin: bool) -> AgencyMemberRead:
    """Privacy gating: a member row is trimmed to what the *member* chose to
    share with teammates — except owners/admins, who administer the roster and
    always see the email + activity and the internal admin_notes."""
    is_private = privacy is not None and privacy.profile_visibility == _VISIBILITY_PRIVATE
    show_email = caller_is_admin or privacy is None or privacy.show_email_to_team
    show_phone = not is_private and privacy is not None and privacy.show_phone_to_team
    show_bio = not is_private
    show_activity = caller_is_admin or privacy is None or privacy.activity_status_visible

    return AgencyMemberRead(
        id=member.id,
        agency_id=member.agency_id,
        user_id=member.user_id,
        role=member.role,
        full_name=user.full_name,
        user_name=user.user_name,
        email=user.email if show_email else None,
        job_title=user.job_title,
        title=member.title,
        phone=user.phone_number if show_phone else None,
        bio=user.summary if show_bio else None,
        is_verified=user.is_verified,
        last_active_at=user.last_login_at if show_activity else None,
        joined_at=member.created_at,
        admin_notes=member.admin_notes if caller_is_admin else None,
    )


def _invitation_read(invitation, inviter_name: str, *, accept_url: str | None = None) -> AgencyInvitationRead:
    return AgencyInvitationRead(
        id=invitation.id,
        agency_id=invitation.agency_id,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        invited_by_name=inviter_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        is_expired=invitation.expires_at < datetime.now(UTC),
        accept_url=accept_url,
    )


@router.post("", response_model=AgencyRead, status_code=status.HTTP_201_CREATED)
async def create_agency(db: DbSession, current_user: CurrentUser, data: AgencyCreate) -> AgencyRead:
    agency = await service.create_agency_with_owner(db, owner=current_user, name=data.name)
    return _agency_read(agency, ROLE_OWNER)


@router.get("/mine", response_model=list[AgencyRead])
async def list_my_agencies(db: DbSession, current_user: CurrentUser) -> list[AgencyRead]:
    rows = await service.get_agencies_for_user(db, current_user)
    return [_agency_read(agency, role, logo_storage_path=logo_path) for agency, role, logo_path in rows]


# --- Invitation preview/accept: NOT agency-scoped in the URL (the token alone
# identifies the agency), and preview doesn't require a session — an invitee
# should see what they're accepting before being asked to log in. ---


@router.get("/invitations/preview", response_model=AgencyInvitationPreview)
async def preview_invitation(db: DbSession, token: str) -> AgencyInvitationPreview:
    invitation, agency, inviter = await service.preview_invitation(db, token)
    return AgencyInvitationPreview(
        agency_name=agency.name, role=invitation.role, invited_by_name=inviter.full_name, email=invitation.email
    )


@router.post("/invitations/accept", response_model=AgencyRead)
async def accept_invitation(db: DbSession, current_user: CurrentUser, data: AgencyInvitationAccept) -> AgencyRead:
    agency, role = await service.accept_invitation(db, data.token, accepting_user=current_user)
    profile = await service.get_or_create_agency_profile(db, agency)
    return _agency_read(agency, role, logo_storage_path=profile.logo_storage_path)


@router.patch("/{agency_id}", response_model=AgencyRead)
async def update_agency_endpoint(
    db: DbSession, data: AgencyUpdate, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> AgencyRead:
    agency, role = agency_and_role
    agency = await service.update_agency(db, agency, name=data.name, actor=current_user)
    profile = await service.get_or_create_agency_profile(db, agency)
    return _agency_read(agency, role, logo_storage_path=profile.logo_storage_path)


@router.delete("/{agency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agency_endpoint(db: DbSession, agency_and_role: OwnedAgency) -> None:
    agency, _role = agency_and_role
    await service.delete_agency(db, agency)


# --- Profile (branding / about / policies) ---
# Reading is open to any member; editing and image uploads are owner/admin,
# same split as the rest of agency settings.


@router.get("/{agency_id}/profile", response_model=AgencyProfileRead)
async def read_profile(db: DbSession, agency_and_role: AnyMember) -> AgencyProfileRead:
    agency, _role = agency_and_role
    profile = await service.get_or_create_agency_profile(db, agency)
    return _profile_read(profile)


@router.patch("/{agency_id}/profile", response_model=AgencyProfileRead)
async def update_profile(
    db: DbSession, data: AgencyProfileUpdate, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> AgencyProfileRead:
    agency, _role = agency_and_role
    # Only the fields the request actually sent — each settings form owns a
    # slice of the profile and submits just its own, so a partial PATCH must
    # not blank the fields another form owns.
    fields = data.model_dump(exclude_unset=True)
    profile = await service.update_agency_profile(db, agency, data=fields)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_SETTINGS,
        event_type="profile_updated",
        summary=f"{current_user.full_name} updated the agency profile",
        actor=current_user,
    )
    return _profile_read(profile)


@router.put("/{agency_id}/logo", response_model=AgencyProfileRead)
async def upload_logo(
    db: DbSession, agency_and_role: AgencyAndRole, file: Annotated[UploadFile, File()]
) -> AgencyProfileRead:
    agency, _role = agency_and_role
    profile = await service.save_agency_image(
        db, agency, kind="logo", content=await file.read(), mime_type=file.content_type or ""
    )
    return _profile_read(profile)


@router.delete("/{agency_id}/logo", response_model=AgencyProfileRead)
async def delete_logo(db: DbSession, agency_and_role: AgencyAndRole) -> AgencyProfileRead:
    agency, _role = agency_and_role
    return _profile_read(await service.clear_agency_image(db, agency, kind="logo"))


@router.put("/{agency_id}/cover", response_model=AgencyProfileRead)
async def upload_cover(
    db: DbSession, agency_and_role: AgencyAndRole, file: Annotated[UploadFile, File()]
) -> AgencyProfileRead:
    agency, _role = agency_and_role
    profile = await service.save_agency_image(
        db, agency, kind="cover", content=await file.read(), mime_type=file.content_type or ""
    )
    return _profile_read(profile)


@router.delete("/{agency_id}/cover", response_model=AgencyProfileRead)
async def delete_cover(db: DbSession, agency_and_role: AgencyAndRole) -> AgencyProfileRead:
    agency, _role = agency_and_role
    return _profile_read(await service.clear_agency_image(db, agency, kind="cover"))


@router.get("/{agency_id}/logo")
async def download_logo(db: DbSession, agency_and_role: AnyMember):
    agency, _role = agency_and_role
    profile = await service.get_or_create_agency_profile(db, agency)
    if not profile.logo_storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No logo set")
    return FileResponse(path=profile.logo_storage_path, media_type=profile.logo_mime_type or "image/png")


@router.get("/{agency_id}/cover")
async def download_cover(db: DbSession, agency_and_role: AnyMember):
    agency, _role = agency_and_role
    profile = await service.get_or_create_agency_profile(db, agency)
    if not profile.cover_storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No cover set")
    return FileResponse(path=profile.cover_storage_path, media_type=profile.cover_mime_type or "image/png")


# --- Members ---


def _is_admin(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN)


async def _reload_member_read(db: DbSession, member, *, caller_role: str) -> AgencyMemberRead:
    """Rebuild the read model for one membership after a mutation — re-fetches
    the user + privacy row so the response matches what a list call returns."""
    result = await db.execute(
        select(User, UserPrivacySettings)
        .outerjoin(UserPrivacySettings, UserPrivacySettings.user_id == User.id)
        .where(User.id == member.user_id)
    )
    user, privacy = result.one()
    return _member_read(member, user, privacy, caller_is_admin=_is_admin(caller_role))


@router.get("/{agency_id}/members", response_model=list[AgencyMemberRead])
async def list_members(db: DbSession, agency_and_role: AnyMember) -> list[AgencyMemberRead]:
    agency, role = agency_and_role
    rows = await service.list_agency_members(db, agency.id)
    return [_member_read(member, user, privacy, caller_is_admin=_is_admin(role)) for member, user, privacy in rows]


@router.patch("/{agency_id}/members/{member_id}", response_model=AgencyMemberRead)
async def update_member_role(
    db: DbSession,
    member_id: uuid.UUID,
    data: AgencyMemberRoleUpdate,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
) -> AgencyMemberRead:
    agency, role = agency_and_role
    member = await service.get_agency_member_or_404(db, agency.id, member_id)
    member = await service.update_member_role(db, member, role=data.role, actor=current_user)
    return await _reload_member_read(db, member, caller_role=role)


@router.patch("/{agency_id}/members/{member_id}/details", response_model=AgencyMemberRead)
async def update_member_details(
    db: DbSession,
    member_id: uuid.UUID,
    data: AgencyMemberDetailsUpdate,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
) -> AgencyMemberRead:
    agency, role = agency_and_role
    member = await service.get_agency_member_or_404(db, agency.id, member_id)
    member = await service.update_member_details(
        db, member, title=data.title, admin_notes=data.admin_notes, actor=current_user
    )
    return await _reload_member_read(db, member, caller_role=role)


@router.delete("/{agency_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    db: DbSession, member_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> None:
    agency, _role = agency_and_role
    member = await service.get_agency_member_or_404(db, agency.id, member_id)
    await service.remove_agency_member(db, member, requested_by=current_user)


# --- Invitations (agency-scoped: list pending / send / revoke) ---


@router.get("/{agency_id}/invitations", response_model=list[AgencyInvitationRead])
async def list_invitations(
    db: DbSession,
    agency_and_role: AgencyAndRole,
    invitation_status: str = Query(default="pending", alias="status", pattern="^(pending|all)$"),
) -> list[AgencyInvitationRead]:
    agency, _role = agency_and_role
    rows = await service.list_invitations(db, agency.id, include_all=invitation_status == "all")
    return [_invitation_read(invitation, inviter.full_name) for invitation, inviter in rows]


@router.post("/{agency_id}/invitations", response_model=AgencyInvitationRead, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    db: DbSession, data: AgencyInvitationCreate, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> AgencyInvitationRead:
    agency, _role = agency_and_role
    invitation, raw_token = await service.create_invitation(
        db, agency, email=data.email, role=data.role, invited_by=current_user
    )
    send_agency_invitation_email(
        to=data.email, agency_name=agency.name, inviter_name=current_user.full_name, token=raw_token
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_TEAM,
        event_type="invitation_sent",
        summary=f"{current_user.full_name} invited {data.email} to join as {data.role}",
        actor=current_user,
    )
    return _invitation_read(invitation, current_user.full_name, accept_url=build_invite_accept_url(raw_token))


@router.post("/{agency_id}/invitations/{invitation_id}/resend", response_model=AgencyInvitationRead)
async def resend_invitation(
    db: DbSession, invitation_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> AgencyInvitationRead:
    agency, _role = agency_and_role
    invitation = await service.get_agency_invitation_or_404(db, agency.id, invitation_id)
    invitation, raw_token = await service.resend_invitation(db, agency, invitation, invited_by=current_user)
    send_agency_invitation_email(
        to=invitation.email, agency_name=agency.name, inviter_name=current_user.full_name, token=raw_token
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_TEAM,
        event_type="invitation_resent",
        summary=f"{current_user.full_name} re-sent the invitation to {invitation.email}",
        actor=current_user,
    )
    return _invitation_read(invitation, current_user.full_name, accept_url=build_invite_accept_url(raw_token))


@router.delete("/{agency_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    db: DbSession, invitation_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> None:
    agency, _role = agency_and_role
    invitation = await service.get_agency_invitation_or_404(db, agency.id, invitation_id)
    email = invitation.email
    await service.revoke_invitation(db, invitation)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_TEAM,
        event_type="invitation_revoked",
        summary=f"{current_user.full_name} revoked the invitation to {email}",
        actor=current_user,
    )


# --- Clients ---
# List/create/read/update/archive are open to any member — day-to-day client
# management, unlike agency settings. Permanent deletion is owner/admin only,
# same split as the agency-level danger zone.


@router.get("/{agency_id}/clients", response_model=list[AgencyClientRead])
async def list_clients(db: DbSession, agency_and_role: AnyMember) -> list[AgencyClientRead]:
    agency, _role = agency_and_role
    clients = await service.list_clients(db, agency.id)
    return [AgencyClientRead.model_validate(client) for client in clients]


@router.post("/{agency_id}/clients", response_model=AgencyClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    db: DbSession, data: AgencyClientCreate, current_user: CurrentUser, agency_and_role: AnyMember
) -> AgencyClientRead:
    agency, _role = agency_and_role
    client = await service.create_client(
        db,
        agency,
        name=data.name,
        primary_contact_name=data.primary_contact_name,
        primary_contact_email=data.primary_contact_email,
        primary_contact_phone=data.primary_contact_phone,
        website=data.website,
        notes=data.notes,
        billing_email=data.billing_email,
        billing_address=data.billing_address,
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_CLIENTS,
        event_type="client_created",
        summary=f"{current_user.full_name} added the client {client.name}",
        actor=current_user,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
    return AgencyClientRead.model_validate(client)


@router.get("/{agency_id}/clients/{client_id}", response_model=AgencyClientRead)
async def read_client(db: DbSession, client_id: uuid.UUID, agency_and_role: AnyMember) -> AgencyClientRead:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    return AgencyClientRead.model_validate(client)


@router.patch("/{agency_id}/clients/{client_id}", response_model=AgencyClientRead)
async def update_client(
    db: DbSession, client_id: uuid.UUID, data: AgencyClientUpdate, agency_and_role: AnyMember
) -> AgencyClientRead:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    client = await service.update_client(
        db,
        client,
        name=data.name,
        primary_contact_name=data.primary_contact_name,
        primary_contact_email=data.primary_contact_email,
        primary_contact_phone=data.primary_contact_phone,
        website=data.website,
        notes=data.notes,
        billing_email=data.billing_email,
        billing_address=data.billing_address,
    )
    return AgencyClientRead.model_validate(client)


@router.patch("/{agency_id}/clients/{client_id}/status", response_model=AgencyClientRead)
async def update_client_status(
    db: DbSession,
    client_id: uuid.UUID,
    data: AgencyClientStatusUpdate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> AgencyClientRead:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    client = await service.set_client_active(db, client, is_active=data.is_active)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_CLIENTS,
        event_type="client_status_changed",
        summary=(f"{current_user.full_name} {'restored' if data.is_active else 'archived'} the client {client.name}"),
        actor=current_user,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
    return AgencyClientRead.model_validate(client)


@router.delete("/{agency_id}/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    db: DbSession, client_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> None:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    client_name = client.name
    await service.delete_client(db, client)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_CLIENTS,
        event_type="client_deleted",
        summary=f"{current_user.full_name} permanently deleted the client {client_name}",
        actor=current_user,
        target_type="client",
        target_name=client_name,
    )


# --- Client portal contacts ---
# Owner/admin only: who on the client's side has portal access, and the
# pending invites. Accepting an invite (portal side) creates the ClientContact.


def _client_invitation_read(invitation, inviter_name: str, *, accept_url: str | None = None) -> ClientInvitationRead:
    return ClientInvitationRead(
        id=invitation.id,
        client_id=invitation.client_id,
        agency_id=invitation.agency_id,
        email=invitation.email,
        status=invitation.status,
        invited_by_name=inviter_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        is_expired=invitation.expires_at < datetime.now(UTC),
        accept_url=accept_url,
    )


@router.get("/{agency_id}/clients/{client_id}/contacts", response_model=list[ClientContactRead])
async def list_client_contacts(
    db: DbSession, client_id: uuid.UUID, agency_and_role: AgencyAndRole
) -> list[ClientContactRead]:
    agency, _role = agency_and_role
    await service.get_client_or_404(db, agency.id, client_id)
    rows = await portal_service.list_client_contacts(db, client_id)
    return [
        ClientContactRead(
            id=contact.id,
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            title=contact.title,
            is_primary=contact.is_primary,
            joined_at=contact.created_at,
        )
        for contact, user in rows
    ]


@router.get("/{agency_id}/clients/{client_id}/contacts/invitations", response_model=list[ClientInvitationRead])
async def list_client_contact_invitations(
    db: DbSession,
    client_id: uuid.UUID,
    agency_and_role: AgencyAndRole,
    invitation_status: str = Query(default="pending", alias="status", pattern="^(pending|all)$"),
) -> list[ClientInvitationRead]:
    agency, _role = agency_and_role
    await service.get_client_or_404(db, agency.id, client_id)
    rows = await portal_service.list_client_invitations(db, client_id, include_all=invitation_status == "all")
    return [_client_invitation_read(invitation, inviter.full_name) for invitation, inviter in rows]


@router.post(
    "/{agency_id}/clients/{client_id}/contacts/invitations",
    response_model=ClientInvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def invite_client_contact(
    db: DbSession,
    client_id: uuid.UUID,
    data: ClientContactInvitationCreate,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
) -> ClientInvitationRead:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    invitation, raw_token = await portal_service.create_client_invitation(
        db, agency, client, email=data.email, invited_by=current_user
    )
    send_client_invitation_email(
        to=data.email,
        agency_name=agency.name,
        client_name=client.name,
        inviter_name=current_user.full_name,
        token=raw_token,
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_CLIENTS,
        event_type="portal_contact_invited",
        summary=f"{current_user.full_name} invited {data.email} to {client.name}'s client portal",
        actor=current_user,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
    return _client_invitation_read(
        invitation, current_user.full_name, accept_url=build_portal_invite_accept_url(raw_token)
    )


@router.post(
    "/{agency_id}/clients/{client_id}/contacts/invitations/{invitation_id}/resend",
    response_model=ClientInvitationRead,
)
async def resend_client_contact_invitation(
    db: DbSession,
    client_id: uuid.UUID,
    invitation_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
) -> ClientInvitationRead:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    invitation = await portal_service.get_client_invitation_or_404(db, client_id, invitation_id)
    invitation, raw_token = await portal_service.resend_client_invitation(
        db, agency, client, invitation, invited_by=current_user
    )
    send_client_invitation_email(
        to=invitation.email,
        agency_name=agency.name,
        client_name=client.name,
        inviter_name=current_user.full_name,
        token=raw_token,
    )
    return _client_invitation_read(
        invitation, current_user.full_name, accept_url=build_portal_invite_accept_url(raw_token)
    )


@router.delete(
    "/{agency_id}/clients/{client_id}/contacts/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_client_contact_invitation(
    db: DbSession, client_id: uuid.UUID, invitation_id: uuid.UUID, agency_and_role: AgencyAndRole
) -> None:
    agency, _role = agency_and_role
    await service.get_client_or_404(db, agency.id, client_id)
    invitation = await portal_service.get_client_invitation_or_404(db, client_id, invitation_id)
    await portal_service.revoke_client_invitation(db, invitation)


@router.delete("/{agency_id}/clients/{client_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_client_contact(
    db: DbSession,
    client_id: uuid.UUID,
    contact_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
) -> None:
    agency, _role = agency_and_role
    client = await service.get_client_or_404(db, agency.id, client_id)
    contact = await portal_service.get_contact_or_404(db, client_id, contact_id)
    await portal_service.remove_client_contact(db, contact)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=activity_models.CATEGORY_CLIENTS,
        event_type="portal_contact_removed",
        summary=f"{current_user.full_name} removed a portal contact from {client.name}",
        actor=current_user,
        target_type="client",
        target_id=client.id,
        target_name=client.name,
    )
