import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# User roles
ROLE_USER = "user"
ROLE_ADMIN = "admin"

roles: list[str] = [ROLE_USER, ROLE_ADMIN]

# Profile visibility options (privacy settings)
VISIBILITY_TEAM = "team"
VISIBILITY_PRIVATE = "private"

profile_visibility_options: list[str] = [
    VISIBILITY_TEAM,
    VISIBILITY_PRIVATE,
]


# Users Table
class User(Base):
    __tablename__ = "users"

    # Users will be identified by a UUID, which is more secure than an integer ID
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # User name
    user_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    # User email
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)

    # Full Name
    full_name: Mapped[str] = mapped_column(String(255))

    # Summary
    summary: Mapped[str] = mapped_column(String(1024), nullable=True)

    # Role
    role: Mapped[str] = mapped_column(String(50), default=ROLE_USER)

    # Hashed password
    hashed_password: Mapped[str] = mapped_column(String(255))

    # Account status
    is_active: Mapped[bool] = mapped_column(default=True)
    is_verified: Mapped[bool] = mapped_column(default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # Profile (collected during onboarding)
    phone_number: Mapped[str | None] = mapped_column(String(32), default=None)
    job_title: Mapped[str | None] = mapped_column(String(255), default=None)


# A user's notification preferences. Created lazily on first access (see
# users/service.py) rather than at signup, so existing rows don't need a
# backfill when a new preference is added later.
class UserNotificationSettings(Base):
    __tablename__ = "user_notification_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    email_product_updates: Mapped[bool] = mapped_column(default=True)
    email_client_activity: Mapped[bool] = mapped_column(default=True)
    email_team_mentions: Mapped[bool] = mapped_column(default=True)
    email_weekly_digest: Mapped[bool] = mapped_column(default=False)
    email_security_alerts: Mapped[bool] = mapped_column(default=True)

    # In-app notification toggles — one per notifications.Notification category.
    # Checked before a Notification row is stored (see notifications/service.py);
    # a missing settings row means "all on" (the column defaults).
    inapp_team: Mapped[bool] = mapped_column(default=True)
    inapp_invoicing: Mapped[bool] = mapped_column(default=True)
    inapp_projects: Mapped[bool] = mapped_column(default=True)
    inapp_messages: Mapped[bool] = mapped_column(default=True)


# A user's privacy preferences, scoped to what their agency teammates can see.
# Created lazily on first access, same as UserNotificationSettings above.
class UserPrivacySettings(Base):
    __tablename__ = "user_privacy_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)

    profile_visibility: Mapped[str] = mapped_column(String(20), default=VISIBILITY_TEAM)
    show_email_to_team: Mapped[bool] = mapped_column(default=True)
    show_phone_to_team: Mapped[bool] = mapped_column(default=False)
    activity_status_visible: Mapped[bool] = mapped_column(default=True)
    analytics_opt_out: Mapped[bool] = mapped_column(default=False)
