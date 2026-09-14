import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from binx_api.modules.users.schemas import EducationEntry, ExperienceEntry


class AgencyRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    # The CALLER's role in this agency — not a property of the agency itself,
    # so this is always built by hand (AgencyRead(...)), never via
    # model_validate(agency), which has no way to know who's asking.
    role: str
    # Whether the agency has a logo, and a cache-bust token (the profile's
    # updated_at epoch) so a re-upload isn't hidden by a stale browser cache.
    has_logo: bool = False
    logo_version: str | None = None


class AgencyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AgencyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AgencyProfileRead(BaseModel):
    """The general agency profile — branding, about/contact, socials, policies.
    Storage paths for the images are never exposed; the frontend fetches the
    bytes through GET /agencies/{id}/logo (proxied)."""

    agency_id: uuid.UUID
    tagline: str | None
    brand_color: str | None
    about: str | None
    founded_year: int | None
    headquarters: str | None
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    address: str | None
    linkedin_url: str | None
    twitter_url: str | None
    instagram_url: str | None
    facebook_url: str | None
    terms_of_service: str | None
    privacy_policy: str | None
    working_policy: str | None
    cancellation_policy: str | None
    has_logo: bool
    has_cover: bool
    logo_version: str | None
    cover_version: str | None


class AgencyProfileUpdate(BaseModel):
    # A true partial patch — the router applies only the fields the request
    # actually sent (model_dump(exclude_unset=True)). Each settings form owns a
    # slice of the profile and submits just that slice; sending a field
    # explicitly as null clears it.
    tagline: str | None = Field(default=None, max_length=255)
    brand_color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    about: str | None = Field(default=None, max_length=8192)
    founded_year: int | None = Field(default=None, ge=1800, le=2100)
    headquarters: str | None = Field(default=None, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=2048)
    address: str | None = Field(default=None, max_length=2048)
    linkedin_url: str | None = Field(default=None, max_length=2048)
    twitter_url: str | None = Field(default=None, max_length=2048)
    instagram_url: str | None = Field(default=None, max_length=2048)
    facebook_url: str | None = Field(default=None, max_length=2048)
    terms_of_service: str | None = Field(default=None, max_length=16384)
    privacy_policy: str | None = Field(default=None, max_length=16384)
    working_policy: str | None = Field(default=None, max_length=16384)
    cancellation_policy: str | None = Field(default=None, max_length=16384)


class AgencyMemberRead(BaseModel):
    # Built by hand from an (AgencyMember, User, UserPrivacySettings | None)
    # row plus the caller's role — most fields live on User, and several are
    # gated by the member's privacy settings (see agencies/router.py's
    # _member_read). `admin_notes` is only populated for owner/admin callers.
    id: uuid.UUID
    agency_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    full_name: str
    user_name: str
    email: EmailStr | None
    # Their personal/global title (User.job_title).
    job_title: str | None
    # What they do at THIS agency (AgencyMember.title).
    title: str | None
    phone: str | None
    bio: str | None
    # Photos: unconditional, like full_name — seeing a teammate's avatar
    # carries the same weight as seeing their name. Storage paths are never
    # exposed; the frontend fetches the bytes through
    # GET /agencies/{id}/members/{member_id}/avatar (proxied).
    has_avatar: bool
    avatar_version: str | None
    has_cover: bool
    cover_version: str | None
    # Qualifications: gated by the same show_bio flag as bio above — a
    # private profile hides these the same way it hides bio.
    skills: list[str]
    experience: list[ExperienceEntry]
    education: list[EducationEntry]
    is_verified: bool
    last_active_at: datetime | None
    joined_at: datetime
    admin_notes: str | None


class AgencyMemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(owner|admin|member)$")


class AgencyMemberDetailsUpdate(BaseModel):
    # Owner/admin edit of the agency-scoped fields on a membership. Full
    # replace — the member drawer submits both together.
    title: str | None = Field(default=None, max_length=255)
    admin_notes: str | None = Field(default=None, max_length=4096)


class AgencyClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agency_id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    primary_contact_name: str | None
    primary_contact_email: str | None
    primary_contact_phone: str | None
    website: str | None
    notes: str | None
    # The "bill to" block on this client's invoices; billing_email falls back
    # to primary_contact_email when null (see modules/invoicing).
    billing_email: str | None
    billing_address: str | None
    created_at: datetime


class AgencyClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    primary_contact_name: str | None = Field(default=None, max_length=255)
    primary_contact_email: EmailStr | None = None
    primary_contact_phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=2048)
    notes: str | None = Field(default=None, max_length=4096)
    billing_email: EmailStr | None = None
    billing_address: str | None = Field(default=None, max_length=2048)


class AgencyClientUpdate(BaseModel):
    # A full replace, like AgencyUpdate — the edit form always submits every
    # field together, so there's no "omit to leave untouched" case to support.
    name: str = Field(min_length=1, max_length=255)
    primary_contact_name: str | None = Field(default=None, max_length=255)
    primary_contact_email: EmailStr | None = None
    primary_contact_phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=2048)
    notes: str | None = Field(default=None, max_length=4096)
    billing_email: EmailStr | None = None
    billing_address: str | None = Field(default=None, max_length=2048)


class ClientBrandingRead(BaseModel):
    """A client's own portal branding — colors, welcome message, and whether
    a logo is set. Storage paths are never exposed; the frontend fetches the
    logo's bytes through GET .../branding/logo (staff) or GET /portal/logo
    (the client's own portal), same rule as AgencyProfileRead."""

    client_id: uuid.UUID
    primary_color: str | None
    accent_color: str | None
    welcome_message: str | None
    has_logo: bool
    logo_version: str | None


class ClientBrandingUpdate(BaseModel):
    # A true partial patch (model_dump(exclude_unset=True) on the router
    # side) — same rule as AgencyProfileUpdate. Sending a field explicitly as
    # null clears it back to inheriting the agency's own branding.
    primary_color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    accent_color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")
    welcome_message: str | None = Field(default=None, max_length=500)


class AgencyClientStatusUpdate(BaseModel):
    is_active: bool


class AgencyInvitationCreate(BaseModel):
    email: EmailStr
    # Deliberately excludes "owner" — granting ownership isn't a plain invite,
    # it's a bigger decision (see agencies/service.py's last-owner guard).
    role: str = Field(pattern="^(admin|member)$")


class AgencyInvitationRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    email: EmailStr
    role: str
    status: str
    invited_by_name: str
    created_at: datetime
    expires_at: datetime
    is_expired: bool = False
    # Only set on the create / resend responses, where the raw token still
    # exists — the list endpoint never has it (only the hash is stored).
    accept_url: str | None = None


class AgencyInvitationAccept(BaseModel):
    token: str


class AgencyInvitationPreview(BaseModel):
    """What an unauthenticated visitor sees before deciding to log in and accept."""

    agency_name: str
    role: str
    invited_by_name: str
    email: EmailStr
