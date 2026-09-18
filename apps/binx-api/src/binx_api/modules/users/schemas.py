import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from binx_api.core.security import Password


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_name: str
    email: EmailStr
    full_name: str
    summary: str | None
    role: str
    is_active: bool
    is_verified: bool
    phone_number: str | None
    job_title: str | None


class UserProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone_number: str | None = Field(default=None, max_length=32)
    job_title: str | None = Field(default=None, max_length=255)
    summary: str | None = Field(default=None, max_length=1024)


class NotificationSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email_product_updates: bool
    email_client_activity: bool
    email_team_mentions: bool
    email_weekly_digest: bool
    email_security_alerts: bool

    inapp_team: bool
    inapp_invoicing: bool
    inapp_projects: bool
    inapp_messages: bool
    inapp_meetings: bool


class NotificationSettingsUpdate(BaseModel):
    email_product_updates: bool
    email_client_activity: bool
    email_team_mentions: bool
    email_weekly_digest: bool
    email_security_alerts: bool

    inapp_team: bool
    inapp_invoicing: bool
    inapp_projects: bool
    inapp_messages: bool
    inapp_meetings: bool


class PrivacySettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    profile_visibility: str
    show_email_to_team: bool
    show_phone_to_team: bool
    activity_status_visible: bool
    analytics_opt_out: bool


class PrivacySettingsUpdate(BaseModel):
    profile_visibility: str = Field(pattern="^(team|private)$")
    show_email_to_team: bool
    show_phone_to_team: bool
    activity_status_visible: bool
    analytics_opt_out: bool


class ExperienceEntry(BaseModel):
    # `id` is client-generated (crypto-random), purely for React key/removal
    # identity within the JSON list — not a database primary key.
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    organization: str = Field(min_length=1, max_length=255)
    start_year: int = Field(ge=1900, le=2100)
    # None means "present" — still working there.
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    description: str | None = Field(default=None, max_length=1024)


class EducationEntry(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    school: str = Field(min_length=1, max_length=255)
    degree: str = Field(min_length=1, max_length=255)
    field_of_study: str | None = Field(default=None, max_length=255)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    end_year: int | None = Field(default=None, ge=1900, le=2100)
    description: str | None = Field(default=None, max_length=1024)


SkillName = Annotated[str, Field(min_length=1, max_length=50)]


class UserProfileRead(BaseModel):
    """Photos + qualifications for the current user's own /profile pages.
    Storage paths are never exposed — the frontend fetches the bytes through
    GET /users/me/avatar (proxied), same convention as AgencyProfileRead."""

    has_avatar: bool
    avatar_version: str | None
    has_cover: bool
    cover_version: str | None
    skills: list[str]
    experience: list[ExperienceEntry]
    education: list[EducationEntry]


class QualificationsUpdate(BaseModel):
    """Full replace of all three together — the qualifications form always
    submits its whole state at once, same as NotificationSettingsUpdate."""

    skills: list[SkillName] = Field(default_factory=list, max_length=40)
    experience: list[ExperienceEntry] = Field(default_factory=list, max_length=20)
    education: list[EducationEntry] = Field(default_factory=list, max_length=20)


class AppearanceSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    accent_color: str | None


class AppearanceSettingsUpdate(BaseModel):
    accent_color: str | None = Field(default=None, pattern="^#[0-9a-fA-F]{6}$")


class TutorialProgressRead(BaseModel):
    """Progress through the staff-portal welcome tour and its per-page
    contextual popups. Built manually in the router (like UserProfileRead)
    rather than from_attributes — dismissed_popups is JSON-in-Text on the
    model, list[str] here."""

    tour_completed: bool
    dismissed_popups: list[str]


class TutorialProgressUpdate(BaseModel):
    """Full replace of both fields together — the client always holds and
    resends its whole current state, same as NotificationSettingsUpdate."""

    tour_completed: bool
    dismissed_popups: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(
        default_factory=list, max_length=64
    )


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: Password


class DeleteAccountRequest(BaseModel):
    current_password: str
