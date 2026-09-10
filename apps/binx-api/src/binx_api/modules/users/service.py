import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.security import hash_password, verify_password
from binx_api.modules.activity import service as activity_service
from binx_api.modules.users.models import User, UserNotificationSettings, UserPrivacySettings


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
# notification/privacy settings, auth tokens) are removed via each table's
# ON DELETE CASCADE — nothing else needs to happen here.
async def delete_account(db: AsyncSession, user: User, *, current_password: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    await db.delete(user)
    await db.commit()
