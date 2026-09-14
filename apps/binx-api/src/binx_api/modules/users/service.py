import json
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.core.images import IMAGE_EXTENSIONS, image_version, unlink_quietly, validate_image
from binx_api.core.security import hash_password, verify_password
from binx_api.modules.activity import service as activity_service
from binx_api.modules.users.models import (
    User,
    UserAppearanceSettings,
    UserNotificationSettings,
    UserPrivacySettings,
    UserProfile,
)

settings = get_settings()


# Get user by ID
async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


# Get user by email
async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


# Get user by user name
async def get_user_by_user_name(db: AsyncSession, user_name: str) -> User | None:
    result = await db.execute(select(User).where(User.user_name == user_name))
    return result.scalar_one_or_none()


# Create a new user
async def create_user(db: AsyncSession, *, user_name: str, email: str, full_name: str, password: str) -> User:
    user = User(
        user_name=user_name,
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# Update the current user's profile. Only overwrites fields that were
# actually provided, so a partial update leaves the rest untouched.
async def update_user_profile(
    db: AsyncSession,
    user: User,
    *,
    full_name: str | None = None,
    phone_number: str | None = None,
    job_title: str | None = None,
    summary: str | None = None,
) -> User:
    if full_name is not None:
        user.full_name = full_name
    if phone_number is not None:
        user.phone_number = phone_number
    if job_title is not None:
        user.job_title = job_title
    if summary is not None:
        user.summary = summary
    await db.commit()
    await db.refresh(user)
    return user


# Get the current user's notification settings, creating a default row on
# first access so existing users don't need a migration backfill.
async def get_notification_settings(db: AsyncSession, user: User) -> UserNotificationSettings:
    result = await db.execute(select(UserNotificationSettings).where(UserNotificationSettings.user_id == user.id))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = UserNotificationSettings(user_id=user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


# Replace the current user's notification settings wholesale (the settings
# form always submits the full set of toggles together).
async def update_notification_settings(
    db: AsyncSession,
    user: User,
    *,
    email_product_updates: bool,
    email_client_activity: bool,
    email_team_mentions: bool,
    email_weekly_digest: bool,
    email_security_alerts: bool,
    inapp_team: bool,
    inapp_invoicing: bool,
    inapp_projects: bool,
    inapp_messages: bool,
) -> UserNotificationSettings:
    settings = await get_notification_settings(db, user)
    settings.email_product_updates = email_product_updates
    settings.email_client_activity = email_client_activity
    settings.email_team_mentions = email_team_mentions
    settings.email_weekly_digest = email_weekly_digest
    settings.email_security_alerts = email_security_alerts
    settings.inapp_team = inapp_team
    settings.inapp_invoicing = inapp_invoicing
    settings.inapp_projects = inapp_projects
    settings.inapp_messages = inapp_messages
    await db.commit()
    await db.refresh(settings)
    return settings


# Get the current user's privacy settings, creating a default row on first
# access — same lazy-creation rationale as get_notification_settings above.
async def get_privacy_settings(db: AsyncSession, user: User) -> UserPrivacySettings:
    result = await db.execute(select(UserPrivacySettings).where(UserPrivacySettings.user_id == user.id))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = UserPrivacySettings(user_id=user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


# Replace the current user's privacy settings wholesale, same as
# update_notification_settings above.
async def update_privacy_settings(
    db: AsyncSession,
    user: User,
    *,
    profile_visibility: str,
    show_email_to_team: bool,
    show_phone_to_team: bool,
    activity_status_visible: bool,
    analytics_opt_out: bool,
) -> UserPrivacySettings:
    settings = await get_privacy_settings(db, user)
    settings.profile_visibility = profile_visibility
    settings.show_email_to_team = show_email_to_team
    settings.show_phone_to_team = show_phone_to_team
    settings.activity_status_visible = activity_status_visible
    settings.analytics_opt_out = analytics_opt_out
    await db.commit()
    await db.refresh(settings)
    return settings


# ---- Profile: photos + qualifications --------------------------------


# Get the current user's profile row, creating a default one on first access
# — same lazy-creation rationale as get_notification_settings/get_privacy_settings.
async def get_or_create_profile(db: AsyncSession, user: User) -> UserProfile:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


def profile_skills(profile: UserProfile) -> list[str]:
    return json.loads(profile.skills) if profile.skills else []


def profile_experience(profile: UserProfile) -> list[dict]:
    return json.loads(profile.experience) if profile.experience else []


def profile_education(profile: UserProfile) -> list[dict]:
    return json.loads(profile.education) if profile.education else []


# Full replace of all three together — the qualifications form always submits
# its whole state at once, same "replace wholesale" pattern as
# update_notification_settings. Entries arrive as plain dicts (already
# validated by QualificationsUpdate) and are stored JSON-encoded, same
# convention as Lead.ai_talking_points (see leads/models.py).
async def update_qualifications(
    db: AsyncSession, user: User, *, skills: list[str], experience: list[dict], education: list[dict]
) -> UserProfile:
    profile = await get_or_create_profile(db, user)
    profile.skills = json.dumps(skills)
    profile.experience = json.dumps(experience)
    profile.education = json.dumps(education)
    await db.commit()
    await db.refresh(profile)
    return profile


# Saves an avatar or cover image's bytes to local disk and records the
# path/mime on the profile. Same shape as agencies/service.py's
# save_agency_image. Storage layout: {agency_upload_dir}/users/{user_id}/{kind}_{uuid}{ext}
# — nested under the existing agency upload dir, same convention as the
# `clients/` subfolder there.
async def save_user_image(db: AsyncSession, user: User, *, kind: str, content: bytes, mime_type: str) -> UserProfile:
    validate_image(content, mime_type)
    profile = await get_or_create_profile(db, user)

    path_attr = f"{kind}_storage_path"
    mime_attr = f"{kind}_mime_type"
    old_path: str | None = getattr(profile, path_attr)

    upload_dir = Path(settings.agency_upload_dir) / "users" / str(user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / f"{kind}_{uuid.uuid4().hex}{IMAGE_EXTENSIONS[mime_type]}"
    stored_path.write_bytes(content)

    setattr(profile, path_attr, str(stored_path))
    setattr(profile, mime_attr, mime_type)
    await db.commit()
    await db.refresh(profile)

    if old_path and old_path != str(stored_path):
        unlink_quietly(old_path)
    return profile


async def clear_user_image(db: AsyncSession, user: User, *, kind: str) -> UserProfile:
    profile = await get_or_create_profile(db, user)
    old_path: str | None = getattr(profile, f"{kind}_storage_path")
    setattr(profile, f"{kind}_storage_path", None)
    setattr(profile, f"{kind}_mime_type", None)
    await db.commit()
    await db.refresh(profile)
    if old_path:
        unlink_quietly(old_path)
    return profile


def avatar_version(profile: UserProfile) -> str | None:
    return image_version(profile.avatar_storage_path)


def cover_version(profile: UserProfile) -> str | None:
    return image_version(profile.cover_storage_path)


# ---- Appearance --------------------------------------------------------


async def get_or_create_appearance_settings(db: AsyncSession, user: User) -> UserAppearanceSettings:
    result = await db.execute(select(UserAppearanceSettings).where(UserAppearanceSettings.user_id == user.id))
    settings_row = result.scalar_one_or_none()
    if settings_row is None:
        settings_row = UserAppearanceSettings(user_id=user.id)
        db.add(settings_row)
        await db.commit()
        await db.refresh(settings_row)
    return settings_row


async def update_appearance_settings(
    db: AsyncSession, user: User, *, accent_color: str | None
) -> UserAppearanceSettings:
    settings_row = await get_or_create_appearance_settings(db, user)
    settings_row.accent_color = accent_color
    await db.commit()
    await db.refresh(settings_row)
    return settings_row


# Changes the current user's password, requiring the current one as proof of
# ownership (the session's access token alone isn't considered enough for a
# credential change).
async def change_password(db: AsyncSession, user: User, *, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    user.hashed_password = hash_password(new_password)
    await db.commit()

    await activity_service.log_account_activity(db, user, event_type="password_changed", summary="Password changed")


# Permanently deletes the current user's account, requiring the current
# password as proof of ownership. Related rows (agency memberships,
# notification/privacy/profile/appearance settings, auth tokens) are removed
# via each table's ON DELETE CASCADE — the only thing the DB can't do is
# clear the user's uploaded images off disk (same reasoning as delete_agency
# in agencies/service.py).
async def delete_account(db: AsyncSession, user: User, *, current_password: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    user_id = user.id
    await db.delete(user)
    await db.commit()
    shutil.rmtree(Path(settings.agency_upload_dir) / "users" / str(user_id), ignore_errors=True)
