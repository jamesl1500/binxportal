import hashlib
import re
import shutil
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.core.security import generate_opaque_token, hash_token
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_TEAM, VISIBILITY_ADMIN
from binx_api.modules.agencies.models import (
    INVITATION_ACCEPTED,
    INVITATION_PENDING,
    INVITATION_REVOKED,
    ROLE_OWNER,
    Agency,
    AgencyClient,
    AgencyInvitation,
    AgencyMember,
    AgencyProfile,
    ClientPortalBranding,
)
from binx_api.modules.billing import service as billing_service
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_TEAM as NOTIFY_CATEGORY_TEAM
from binx_api.modules.notifications.models import EVENT_INVITE_ACCEPTED as NOTIFY_EVENT_INVITE_ACCEPTED
from binx_api.modules.users.models import User, UserPrivacySettings

settings = get_settings()

INVITATION_EXPIRE_DAYS = 7

# Logos / covers are shown inline in the app chrome and settings — keep this
# list to what a browser renders reliably.
ALLOWED_AGENCY_IMAGE_MIME_TYPES: set[str] = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_IMAGE_EXTENSIONS: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

_SLUG_INVALID_CHARS = re.compile(r"[^a-z0-9]+")


def _slugify(value: str) -> str:
    slug = _SLUG_INVALID_CHARS.sub("-", value.lower()).strip("-")
    return slug or "agency"


async def _slug_taken(db: AsyncSession, slug: str) -> bool:
    result = await db.execute(select(Agency.id).where(Agency.slug == slug))
    return result.scalar_one_or_none() is not None


async def _generate_unique_slug(db: AsyncSession, name: str) -> str:
    base = _slugify(name)
    slug = base
    suffix = 2
    while await _slug_taken(db, slug):
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


# ---- Plan limits --------------------------------------------------------
# The owned-agency cap comes from the owner's most generous plan across the
# agencies they already own (billing/service.py::max_owned_agencies_for);
# a brand-new account with no agencies gets the Free plan's cap.
# create_agency_with_owner calls this on every creation path.
async def _check_can_create_agency(db: AsyncSession, owner: User) -> None:
    limit = await billing_service.max_owned_agencies_for(db, owner)
    if limit is None:
        return
    owned = await db.execute(
        select(func.count())
        .select_from(AgencyMember)
        .where(AgencyMember.user_id == owner.id, AgencyMember.role == ROLE_OWNER)
    )
    if int(owned.scalar_one()) >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Your plan allows {limit} owned {'agency' if limit == 1 else 'agencies'}. "
            "Upgrade an existing agency's plan in Settings → Plan to create more.",
        )


# Creates an agency and makes the given user its owner, in one transaction.
async def create_agency_with_owner(db: AsyncSession, *, owner: User, name: str) -> Agency:
    await _check_can_create_agency(db, owner)
    slug = await _generate_unique_slug(db, name)
    agency = Agency(name=name, slug=slug)
    db.add(agency)
    await db.flush()  # populate agency.id before creating the membership row

    db.add(AgencyMember(agency_id=agency.id, user_id=owner.id, role=ROLE_OWNER))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create agency, please try again") from None

    await db.refresh(agency)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_TEAM,
        event_type="agency_created",
        summary=f"{owner.full_name} created {agency.name}",
        actor=owner,
    )
    return agency


# All agencies the given user is a member of, paired with their role in
# each and whether the agency has a logo (for the header / org switcher),
# oldest membership first — this order is what the frontend falls back to as
# the "current" agency when no preference cookie is set, so it needs to be
# stable across requests.
async def get_agencies_for_user(db: AsyncSession, user: User) -> list[tuple[Agency, str, str | None]]:
    result = await db.execute(
        select(Agency, AgencyMember.role, AgencyProfile.logo_storage_path)
        .join(AgencyMember, AgencyMember.agency_id == Agency.id)
        .outerjoin(AgencyProfile, AgencyProfile.agency_id == Agency.id)
        .where(AgencyMember.user_id == user.id)
        .order_by(AgencyMember.created_at)
    )
    return [(agency, role, logo_path) for agency, role, logo_path in result.all()]


# Renames an agency. Slug is intentionally left untouched — regenerating it
# on every rename would silently break any links or bookmarks built on it.
async def update_agency(db: AsyncSession, agency: Agency, *, name: str, actor: User | None = None) -> Agency:
    old_name = agency.name
    agency.name = name
    await db.commit()
    await db.refresh(agency)

    if old_name != name:
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_TEAM,
            event_type="agency_renamed",
            summary=(
                f"{actor.full_name} renamed the agency from “{old_name}” to “{name}”"
                if actor
                else f"Renamed from “{old_name}” to “{name}”"
            ),
            actor=actor,
        )
    return agency


# Permanently deletes an agency. Related rows (memberships, clients, the
# profile) are removed via each table's ON DELETE CASCADE; the only thing the
# DB can't do is clear the agency's uploaded images off disk.
async def delete_agency(db: AsyncSession, agency: Agency) -> None:
    agency_id = agency.id
    await db.delete(agency)
    await db.commit()
    shutil.rmtree(Path(settings.agency_upload_dir) / str(agency_id), ignore_errors=True)


# ---- Profile (branding / about / policies) --------------------------------


def _unlink_quietly(storage_path: str) -> None:
    """Best-effort delete of an image's bytes — a filesystem hiccup should
    never block clearing the row that points at them."""
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        pass


def _image_version(storage_path: str | None) -> str | None:
    """A short, stable-per-file token the frontend appends as ?v= so a
    re-uploaded image (new path) isn't hidden by a stale browser cache."""
    if not storage_path:
        return None
    return hashlib.sha1(storage_path.encode("utf-8")).hexdigest()[:12]  # noqa: S324 - cache-bust only


async def get_or_create_agency_profile(db: AsyncSession, agency: Agency) -> AgencyProfile:
    result = await db.execute(select(AgencyProfile).where(AgencyProfile.agency_id == agency.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = AgencyProfile(agency_id=agency.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


# Full replace of the editable text fields — the settings forms always submit
# every field they own together, same "full replace" pattern as update_client.
async def update_agency_profile(db: AsyncSession, agency: Agency, *, data: dict) -> AgencyProfile:
    profile = await get_or_create_agency_profile(db, agency)
    for field, value in data.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


def _validate_agency_image(content: bytes, mime_type: str) -> None:
    if mime_type not in ALLOWED_AGENCY_IMAGE_MIME_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPEG, PNG, WebP, or GIF image")
    if len(content) > settings.agency_image_max_bytes:
        max_mb = settings.agency_image_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Images must be {max_mb}MB or smaller")


# Saves a logo or cover image's bytes to local disk and records the path/mime
# on the profile. Removes the previous file so re-uploads don't pile up.
# Storage layout: {agency_upload_dir}/{agency_id}/{kind}_{uuid}{ext}.
async def save_agency_image(
    db: AsyncSession, agency: Agency, *, kind: str, content: bytes, mime_type: str
) -> AgencyProfile:
    _validate_agency_image(content, mime_type)
    profile = await get_or_create_agency_profile(db, agency)

    path_attr = f"{kind}_storage_path"
    mime_attr = f"{kind}_mime_type"
    old_path: str | None = getattr(profile, path_attr)

    upload_dir = Path(settings.agency_upload_dir) / str(agency.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"{kind}_{uuid.uuid4().hex}{_IMAGE_EXTENSIONS[mime_type]}"
    stored_path.write_bytes(content)

    setattr(profile, path_attr, str(stored_path))
    setattr(profile, mime_attr, mime_type)
    await db.commit()
    await db.refresh(profile)

    if old_path and old_path != str(stored_path):
        _unlink_quietly(old_path)
    return profile


async def clear_agency_image(db: AsyncSession, agency: Agency, *, kind: str) -> AgencyProfile:
    profile = await get_or_create_agency_profile(db, agency)
    old_path: str | None = getattr(profile, f"{kind}_storage_path")
    setattr(profile, f"{kind}_storage_path", None)
    setattr(profile, f"{kind}_mime_type", None)
    await db.commit()
    await db.refresh(profile)
    if old_path:
        _unlink_quietly(old_path)
    return profile


# ---- Client portal branding ------------------------------------------


async def get_or_create_client_branding(db: AsyncSession, client: AgencyClient) -> ClientPortalBranding:
    result = await db.execute(select(ClientPortalBranding).where(ClientPortalBranding.client_id == client.id))
    branding = result.scalar_one_or_none()
    if branding is None:
        branding = ClientPortalBranding(client_id=client.id)
        db.add(branding)
        await db.commit()
        await db.refresh(branding)
    return branding


# Partial patch — only the fields the request actually sent (see
# ClientBrandingUpdate / update_agency_profile's matching pattern).
async def update_client_branding(db: AsyncSession, client: AgencyClient, *, data: dict) -> ClientPortalBranding:
    branding = await get_or_create_client_branding(db, client)
    for field, value in data.items():
        setattr(branding, field, value)
    await db.commit()
    await db.refresh(branding)
    return branding


# Storage layout: {agency_upload_dir}/clients/{client_id}/logo_{uuid}{ext} —
# nested under the existing agency upload dir rather than a new settings
# field. Reuses the agency image validation/extension helpers, which are
# already generic (not agency-specific).
async def save_client_logo(
    db: AsyncSession, client: AgencyClient, *, content: bytes, mime_type: str
) -> ClientPortalBranding:
    _validate_agency_image(content, mime_type)
    branding = await get_or_create_client_branding(db, client)
    old_path = branding.logo_storage_path

    upload_dir = Path(settings.agency_upload_dir) / "clients" / str(client.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"logo_{uuid.uuid4().hex}{_IMAGE_EXTENSIONS[mime_type]}"
    stored_path.write_bytes(content)

    branding.logo_storage_path = str(stored_path)
    branding.logo_mime_type = mime_type
    await db.commit()
    await db.refresh(branding)

    if old_path and old_path != str(stored_path):
        _unlink_quietly(old_path)
    return branding


async def clear_client_logo(db: AsyncSession, client: AgencyClient) -> ClientPortalBranding:
    branding = await get_or_create_client_branding(db, client)
    old_path = branding.logo_storage_path
    branding.logo_storage_path = None
    branding.logo_mime_type = None
    await db.commit()
    await db.refresh(branding)
    if old_path:
        _unlink_quietly(old_path)
    return branding


# ---- Members ----


# Every member of an agency, each paired with their user record and privacy
# settings (may be None — the row is created lazily), oldest membership first.
# The router applies the privacy gating; this just gathers the data.
async def list_agency_members(
    db: AsyncSession, agency_id: uuid.UUID
) -> list[tuple[AgencyMember, User, UserPrivacySettings | None]]:
    result = await db.execute(
        select(AgencyMember, User, UserPrivacySettings)
        .join(User, User.id == AgencyMember.user_id)
        .outerjoin(UserPrivacySettings, UserPrivacySettings.user_id == User.id)
        .where(AgencyMember.agency_id == agency_id)
        .order_by(AgencyMember.created_at)
    )
    return [(member, user, privacy) for member, user, privacy in result.all()]


# Owner/admin edit of a membership's agency-scoped fields (see the team-page
# member drawer). A full replace of the two fields it owns.
async def update_member_details(
    db: AsyncSession,
    member: AgencyMember,
    *,
    title: str | None,
    admin_notes: str | None,
    actor: User | None = None,
) -> AgencyMember:
    member.title = title
    member.admin_notes = admin_notes
    await db.commit()
    await db.refresh(member)

    target = await db.get(User, member.user_id)
    await activity_service.log_agency_activity(
        db,
        member.agency_id,
        category=CATEGORY_TEAM,
        event_type="member_details_updated",
        visibility=VISIBILITY_ADMIN,
        summary=(
            f"{actor.full_name} updated the agency title/notes for {target.full_name if target else 'a member'}"
            if actor
            else f"Agency title/notes updated for {target.full_name if target else 'a member'}"
        ),
        actor=actor,
        target_type="user",
        target_id=member.user_id,
        target_name=target.full_name if target else None,
    )
    return member


async def get_agency_member_or_404(db: AsyncSession, agency_id: uuid.UUID, member_id: uuid.UUID) -> AgencyMember:
    result = await db.execute(
        select(AgencyMember).where(AgencyMember.id == member_id, AgencyMember.agency_id == agency_id)
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    return member


async def _count_owners(db: AsyncSession, agency_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(AgencyMember)
        .where(AgencyMember.agency_id == agency_id, AgencyMember.role == ROLE_OWNER)
    )
    return result.scalar_one()


# Changes a member's role. Guards against demoting the agency's last owner,
# which would leave it with no one able to do owner-only things (like delete
# it, or promote someone else back to owner).
async def update_member_role(
    db: AsyncSession, member: AgencyMember, *, role: str, actor: User | None = None
) -> AgencyMember:
    if member.role == ROLE_OWNER and role != ROLE_OWNER and await _count_owners(db, member.agency_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "An agency must have at least one owner")
    old_role = member.role
    member.role = role
    await db.commit()
    await db.refresh(member)

    if old_role != role:
        target = await db.get(User, member.user_id)
        name = target.full_name if target else "a member"
        await activity_service.log_agency_activity(
            db,
            member.agency_id,
            category=CATEGORY_TEAM,
            event_type="member_role_changed",
            visibility=VISIBILITY_ADMIN,
            summary=(
                f"{actor.full_name} changed {name}'s role from {old_role} to {role}"
                if actor
                else f"{name}'s role changed from {old_role} to {role}"
            ),
            actor=actor,
            target_type="user",
            target_id=member.user_id,
            target_name=target.full_name if target else None,
        )
    return member


# Removes a member from the agency. Self-removal is deliberately rejected —
# "leave an agency" is a distinct, self-directed action this doesn't cover —
# and, like update_member_role, the last owner can't be removed.
async def remove_agency_member(db: AsyncSession, member: AgencyMember, *, requested_by: User) -> None:
    if member.user_id == requested_by.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't remove yourself from the agency")
    if member.role == ROLE_OWNER and await _count_owners(db, member.agency_id) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "An agency must have at least one owner")

    target = await db.get(User, member.user_id)
    agency_id = member.agency_id
    await db.delete(member)
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=CATEGORY_TEAM,
        event_type="member_removed",
        visibility=VISIBILITY_ADMIN,
        summary=f"{requested_by.full_name} removed {target.full_name if target else 'a member'} from the agency",
        actor=requested_by,
        target_type="user",
        target_id=target.id if target else None,
        target_name=target.full_name if target else None,
    )


# ---- Invitations ----


async def _is_already_member(db: AsyncSession, agency_id: uuid.UUID, email: str) -> bool:
    result = await db.execute(
        select(AgencyMember.id)
        .join(User, User.id == AgencyMember.user_id)
        .where(AgencyMember.agency_id == agency_id, User.email == email)
    )
    return result.scalar_one_or_none() is not None


# Invites someone to an agency by email. Re-issues (rather than duplicates) an
# existing pending invite to the same address, so re-sending doesn't pile up
# rows. Returns the raw token alongside the record — it's never persisted, so
# this is the only place the caller (the router, to email it out) can get it.
async def create_invitation(
    db: AsyncSession, agency: Agency, *, email: str, role: str, invited_by: User
) -> tuple[AgencyInvitation, str]:
    if await _is_already_member(db, agency.id, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "That person is already a member of this agency")

    result = await db.execute(
        select(AgencyInvitation).where(
            AgencyInvitation.agency_id == agency.id,
            AgencyInvitation.email == email,
            AgencyInvitation.status == INVITATION_PENDING,
        )
    )
    invitation = result.scalar_one_or_none()

    raw_token = generate_opaque_token()
    expires_at = datetime.now(UTC) + timedelta(days=INVITATION_EXPIRE_DAYS)

    if invitation is None:
        invitation = AgencyInvitation(
            agency_id=agency.id,
            email=email,
            role=role,
            invited_by_id=invited_by.id,
            token_hash=hash_token(raw_token),
            status=INVITATION_PENDING,
            expires_at=expires_at,
        )
        db.add(invitation)
    else:
        invitation.role = role
        invitation.invited_by_id = invited_by.id
        invitation.token_hash = hash_token(raw_token)
        invitation.expires_at = expires_at

    await db.commit()
    await db.refresh(invitation)
    return invitation, raw_token


# Invitations for an agency, paired with who sent each one, most recently
# sent first. Pending only by default (that's what you act on); include_all
# also returns accepted / revoked ones for the history view.
async def list_invitations(
    db: AsyncSession, agency_id: uuid.UUID, *, include_all: bool = False
) -> list[tuple[AgencyInvitation, User]]:
    query = (
        select(AgencyInvitation, User)
        .join(User, User.id == AgencyInvitation.invited_by_id)
        .where(AgencyInvitation.agency_id == agency_id)
        .order_by(AgencyInvitation.created_at.desc())
    )
    if not include_all:
        query = query.where(AgencyInvitation.status == INVITATION_PENDING)
    result = await db.execute(query)
    return [(invitation, inviter) for invitation, inviter in result.all()]


# Re-issues a pending invitation's token + expiry and hands back the fresh raw
# token so the router can email it (and surface a copy-able link). Reuses
# create_invitation's reissue path.
async def resend_invitation(
    db: AsyncSession, agency: Agency, invitation: AgencyInvitation, *, invited_by: User
) -> tuple[AgencyInvitation, str]:
    if invitation.status != INVITATION_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a pending invitation can be resent")
    return await create_invitation(db, agency, email=invitation.email, role=invitation.role, invited_by=invited_by)


async def get_agency_invitation_or_404(
    db: AsyncSession, agency_id: uuid.UUID, invitation_id: uuid.UUID
) -> AgencyInvitation:
    result = await db.execute(
        select(AgencyInvitation).where(AgencyInvitation.id == invitation_id, AgencyInvitation.agency_id == agency_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    return invitation


# Soft-cancels an invite (rather than deleting it) so there's a record it was
# sent and then withdrawn, not just silently gone.
async def revoke_invitation(db: AsyncSession, invitation: AgencyInvitation) -> None:
    invitation.status = INVITATION_REVOKED
    await db.commit()


async def _get_valid_invitation(db: AsyncSession, raw_token: str) -> AgencyInvitation:
    """Looks up a still-pending, non-expired invitation by its raw token. Deliberately
    doesn't distinguish "not found" from "expired" from "already used" in the error —
    same reasoning as auth/service.py's _peek_token for password-reset-style tokens."""
    result = await db.execute(select(AgencyInvitation).where(AgencyInvitation.token_hash == hash_token(raw_token)))
    invitation = result.scalar_one_or_none()
    if invitation is None or invitation.status != INVITATION_PENDING or invitation.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invitation link is invalid or has expired")
    return invitation


# Resolves a token to what an unauthenticated visitor should see before
# deciding to log in and accept — doesn't consume the invitation.
async def preview_invitation(db: AsyncSession, raw_token: str) -> tuple[AgencyInvitation, Agency, User]:
    invitation = await _get_valid_invitation(db, raw_token)
    agency = await db.get(Agency, invitation.agency_id)
    inviter = await db.get(User, invitation.invited_by_id)
    assert agency is not None and inviter is not None  # FK guarantees both still exist
    return invitation, agency, inviter


# Consumes an invitation, creating the accepting user's membership. The
# accepting account's email must match the invited address — otherwise
# anyone who got hold of the link (e.g. forwarded by mistake) could join
# under their own account instead of the intended recipient's.
async def accept_invitation(db: AsyncSession, raw_token: str, *, accepting_user: User) -> tuple[Agency, str]:
    invitation = await _get_valid_invitation(db, raw_token)

    if invitation.email.lower() != accepting_user.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This invitation was sent to a different email address")

    if not await _is_already_member(db, invitation.agency_id, accepting_user.email):
        db.add(AgencyMember(agency_id=invitation.agency_id, user_id=accepting_user.id, role=invitation.role))

    invitation.status = INVITATION_ACCEPTED
    invitation.accepted_at = datetime.now(UTC)
    await db.commit()

    agency = await db.get(Agency, invitation.agency_id)
    assert agency is not None

    # Let whoever sent the invite know it landed.
    article = "an" if invitation.role == "admin" else "a"
    await notifications_service.notify(
        db,
        user_id=invitation.invited_by_id,
        category=NOTIFY_CATEGORY_TEAM,
        event_type=NOTIFY_EVENT_INVITE_ACCEPTED,
        title=f"{accepting_user.full_name} joined {agency.name}",
        body=f"They accepted your invitation and are now {article} {invitation.role}.",
        link="/team",
        agency_id=agency.id,
        actor=accepting_user,
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_TEAM,
        event_type="member_joined",
        summary=f"{accepting_user.full_name} joined the agency as {article} {invitation.role}",
        actor=accepting_user,
        target_type="user",
        target_id=accepting_user.id,
        target_name=accepting_user.full_name,
    )
    return agency, invitation.role


# ---- Clients -------------------------------------------------------------


async def _client_slug_taken(db: AsyncSession, agency_id: uuid.UUID, slug: str) -> bool:
    result = await db.execute(
        select(AgencyClient.id).where(AgencyClient.agency_id == agency_id, AgencyClient.slug == slug)
    )
    return result.scalar_one_or_none() is not None


async def _generate_unique_client_slug(db: AsyncSession, agency_id: uuid.UUID, name: str) -> str:
    base = _slugify(name)
    slug = base
    suffix = 2
    while await _client_slug_taken(db, agency_id, slug):
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


# The plan's client cap (billing/models.py::PLANS) applies to the agency's
# active clients. create_client calls this on every creation path.
async def _check_can_create_client(db: AsyncSession, agency: Agency) -> None:
    limits = await billing_service.get_plan_limits(db, agency.id)
    active = await db.execute(
        select(func.count())
        .select_from(AgencyClient)
        .where(AgencyClient.agency_id == agency.id, AgencyClient.is_active.is_(True))
    )
    billing_service.assert_within_limit(
        int(active.scalar_one()), limits.max_clients, resource="clients", plan_name=limits.name
    )


# Creates a client under the given agency. Contact fields are all optional —
# a client can be jotted down with just a name and filled in later.
async def create_client(
    db: AsyncSession,
    agency: Agency,
    *,
    name: str,
    primary_contact_name: str | None,
    primary_contact_email: str | None,
    primary_contact_phone: str | None,
    website: str | None,
    notes: str | None,
    billing_email: str | None = None,
    billing_address: str | None = None,
) -> AgencyClient:
    await _check_can_create_client(db, agency)
    slug = await _generate_unique_client_slug(db, agency.id, name)
    client = AgencyClient(
        agency_id=agency.id,
        name=name,
        slug=slug,
        primary_contact_name=primary_contact_name,
        primary_contact_email=primary_contact_email,
        primary_contact_phone=primary_contact_phone,
        website=website,
        notes=notes,
        billing_email=billing_email,
        billing_address=billing_address,
    )
    db.add(client)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create client, please try again") from None

    await db.refresh(client)
    return client


# Every client of an agency, active ones first and alphabetical within each
# group — the common case is scanning for a name, and archived clients are
# reference material rather than what you're usually looking for.
async def list_clients(db: AsyncSession, agency_id: uuid.UUID) -> list[AgencyClient]:
    result = await db.execute(
        select(AgencyClient)
        .where(AgencyClient.agency_id == agency_id)
        .order_by(AgencyClient.is_active.desc(), AgencyClient.name)
    )
    return list(result.scalars().all())


async def get_client_or_404(db: AsyncSession, agency_id: uuid.UUID, client_id: uuid.UUID) -> AgencyClient:
    result = await db.execute(
        select(AgencyClient).where(AgencyClient.id == client_id, AgencyClient.agency_id == agency_id)
    )
    client = result.scalar_one_or_none()
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client


# Updates a client's details. A full replace, like update_agency — the slug
# is deliberately left untouched even if the name changes, for the same
# reason: regenerating it would silently break any links built on it.
async def update_client(
    db: AsyncSession,
    client: AgencyClient,
    *,
    name: str,
    primary_contact_name: str | None,
    primary_contact_email: str | None,
    primary_contact_phone: str | None,
    website: str | None,
    notes: str | None,
    billing_email: str | None = None,
    billing_address: str | None = None,
) -> AgencyClient:
    client.name = name
    client.primary_contact_name = primary_contact_name
    client.primary_contact_email = primary_contact_email
    client.primary_contact_phone = primary_contact_phone
    client.website = website
    client.notes = notes
    client.billing_email = billing_email
    client.billing_address = billing_address
    await db.commit()
    await db.refresh(client)
    return client


# Archives or restores a client — kept separate from update_client so the
# quick action in the client table doesn't need the full edit form's data.
async def set_client_active(db: AsyncSession, client: AgencyClient, *, is_active: bool) -> AgencyClient:
    client.is_active = is_active
    await db.commit()
    await db.refresh(client)
    return client


# Permanently deletes a client. Distinct from archiving (set_client_active,
# reversible) — this is the "actually gone" action, so it's gated to
# owner/admin at the router level, same as deleting the agency itself.
# projects.client_id and invoices.client_id have no ON DELETE on their FKs, so
# a client with either raises an IntegrityError here instead of silently
# taking them with it — caught and turned into a message pointing at the
# actual next step.
async def delete_client(db: AsyncSession, client: AgencyClient) -> None:
    client_id = client.id
    await db.delete(client)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This client still has projects or invoices — reassign or delete those first",
        ) from None
    # ClientPortalBranding cascades in the DB; only its uploaded logo file
    # (if any) needs a manual cleanup, same as delete_agency's images.
    shutil.rmtree(Path(settings.agency_upload_dir) / "clients" / str(client_id), ignore_errors=True)
