import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Agency member roles
ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"

agency_member_roles: list[str] = [
    ROLE_OWNER,
    ROLE_ADMIN,
    ROLE_MEMBER,
]

# Invitation lifecycle
INVITATION_PENDING = "pending"
INVITATION_ACCEPTED = "accepted"
INVITATION_REVOKED = "revoked"


# An agency is the workspace a user (or team) operates in.
class Agency(Base):
    __tablename__ = "agencies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(63), unique=True, index=True)


# Join table: which users belong to which agencies, and with what role.
class AgencyMember(Base):
    __tablename__ = "agency_members"
    __table_args__ = (UniqueConstraint("agency_id", "user_id", name="uq_agency_members_agency_id_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(50), default=ROLE_MEMBER)

    # What this person does *at this agency* — distinct from User.job_title,
    # which is their own personal/global title. Set by owners/admins on the
    # team page.
    title: Mapped[str | None] = mapped_column(String(255), default=None)
    # Internal notes about this member, visible only to owners/admins.
    admin_notes: Mapped[str | None] = mapped_column(String(4096), default=None)


# A client the agency manages within Binx. Slugs are unique per agency, not globally.
class AgencyClient(Base):
    __tablename__ = "agency_clients"
    __table_args__ = (UniqueConstraint("agency_id", "slug", name="uq_agency_clients_agency_id_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(63))
    is_active: Mapped[bool] = mapped_column(default=True)

    # Optional contact/reference details — all nullable since a client can be
    # jotted down quickly (name only) and filled in later.
    primary_contact_name: Mapped[str | None] = mapped_column(String(255), default=None)
    primary_contact_email: Mapped[str | None] = mapped_column(String(255), default=None)
    primary_contact_phone: Mapped[str | None] = mapped_column(String(32), default=None)
    website: Mapped[str | None] = mapped_column(String(2048), default=None)
    notes: Mapped[str | None] = mapped_column(String(4096), default=None)

    # The "bill to" block on this client's invoices (see modules/invoicing).
    # billing_email falls back to primary_contact_email when null.
    billing_email: Mapped[str | None] = mapped_column(String(255), default=None)
    billing_address: Mapped[str | None] = mapped_column(String(2048), default=None)


# Everything about an agency beyond its name/slug — branding (logo, cover,
# colour), the about/contact blurb, social links, and the policy blocks.
# One row per agency, created lazily on first access (same pattern as
# users/models.py's UserNotificationSettings and invoicing's
# AgencyBillingSettings). Distinct from AgencyBillingSettings, which only
# holds the invoice "from" block — this is the general agency profile.
class AgencyProfile(Base):
    __tablename__ = "agency_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, index=True)

    # Branding
    tagline: Mapped[str | None] = mapped_column(String(255), default=None)
    brand_color: Mapped[str | None] = mapped_column(String(7), default=None)  # "#0a0a0b"

    # About
    about: Mapped[str | None] = mapped_column(String(8192), default=None)
    founded_year: Mapped[int | None] = mapped_column(Integer, default=None)
    headquarters: Mapped[str | None] = mapped_column(String(255), default=None)

    # Contact
    contact_email: Mapped[str | None] = mapped_column(String(255), default=None)
    contact_phone: Mapped[str | None] = mapped_column(String(32), default=None)
    website: Mapped[str | None] = mapped_column(String(2048), default=None)
    address: Mapped[str | None] = mapped_column(String(2048), default=None)

    # Socials
    linkedin_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    twitter_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    instagram_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    facebook_url: Mapped[str | None] = mapped_column(String(2048), default=None)

    # Policy blocks — plain text for now (rendered as-is on the frontend).
    terms_of_service: Mapped[str | None] = mapped_column(String(16384), default=None)
    privacy_policy: Mapped[str | None] = mapped_column(String(16384), default=None)
    working_policy: Mapped[str | None] = mapped_column(String(16384), default=None)
    cancellation_policy: Mapped[str | None] = mapped_column(String(16384), default=None)

    # Images — bytes on local disk (see agencies/service.py), only the
    # path/mime tracked here so swapping to object storage later doesn't
    # touch this shape.
    logo_storage_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    logo_mime_type: Mapped[str | None] = mapped_column(String(255), default=None)
    cover_storage_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    cover_mime_type: Mapped[str | None] = mapped_column(String(255), default=None)


# White-labeling for one client's portal: their own colors, logo, and a
# custom welcome message — overriding the agency's own AgencyProfile
# branding when set (see client_portal/service.py::portal_client_read, which
# falls back to the agency's brand_color/logo when a client hasn't set its
# own). One row per client, created lazily on first access, same pattern as
# AgencyProfile above.
class ClientPortalBranding(Base):
    __tablename__ = "client_portal_branding"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agency_clients.id", ondelete="CASCADE"), unique=True, index=True
    )

    primary_color: Mapped[str | None] = mapped_column(String(7), default=None)  # "#0a0a0b"
    accent_color: Mapped[str | None] = mapped_column(String(7), default=None)
    welcome_message: Mapped[str | None] = mapped_column(String(500), default=None)

    logo_storage_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    logo_mime_type: Mapped[str | None] = mapped_column(String(255), default=None)


# An outstanding (or resolved) invite for someone to join an agency. Unlike
# AgencyMember, the invitee doesn't need an existing account yet — they're
# identified by email until the invite is accepted, at which point an
# AgencyMember row is created for whichever account holds that email.
class AgencyInvitation(Base):
    __tablename__ = "agency_invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(50), default=ROLE_MEMBER)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Only the hash is stored; the raw token is only ever seen by the invited email's recipient.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default=INVITATION_PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
