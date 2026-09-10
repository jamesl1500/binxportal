import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    current_password: str
