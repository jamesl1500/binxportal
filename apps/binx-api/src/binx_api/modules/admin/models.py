import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

TARGET_USER = "user"
TARGET_AGENCY = "agency"
ADMIN_TARGET_TYPES: list[str] = [TARGET_USER, TARGET_AGENCY]

# What a platform admin did. Free-form like notifications' event_type, these
# are the ones the console writes today.
ACTION_NOTE = "note"
ACTION_PASSWORD_RESET_SENT = "password_reset_sent"
ACTION_VERIFICATION_RESENT = "verification_resent"
ACTION_MARKED_VERIFIED = "marked_verified"
ACTION_SIGNED_OUT = "signed_out_everywhere"
ACTION_DEACTIVATED = "deactivated"
ACTION_REACTIVATED = "reactivated"
ACTION_ROLE_CHANGED = "role_changed"
ACTION_TRIAL_GRANTED = "trial_granted"
ACTION_TRIAL_ENDED = "trial_ended"


# Append-only record of everything the Binx team does through the admin
# console — the accountability trail for support work on someone else's
# account. No FK on target_id (a target can be deleted; its history stays);
# actor and target names are snapshots, like ActivityLog.
class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None, index=True
    )
    actor_name: Mapped[str] = mapped_column(String(255))

    action: Mapped[str] = mapped_column(String(50), index=True)
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    target_label: Mapped[str] = mapped_column(String(255))
    # A human sentence ("Extended the Pro trial to Dec 2") or the note text.
    detail: Mapped[str | None] = mapped_column(Text, default=None)

    # Overrides Base's nullable column: every entry is timestamped on write
    # and the log is ordered by it.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
