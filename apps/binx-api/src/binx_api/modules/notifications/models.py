import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Broad buckets a notification falls into. These map 1:1 onto the per-user
# in-app mute toggles on UserNotificationSettings (inapp_<category>) and drive
# the icon / grouping on the frontend. Deliberately coarse — the fine-grained
# distinction lives in `event_type`.
CATEGORY_TEAM = "team"
CATEGORY_INVOICING = "invoicing"
CATEGORY_PROJECTS = "projects"
CATEGORY_MESSAGES = "messages"
CATEGORY_MEETINGS = "meetings"

notification_categories: list[str] = [
    CATEGORY_TEAM,
    CATEGORY_INVOICING,
    CATEGORY_PROJECTS,
    CATEGORY_MESSAGES,
    CATEGORY_MEETINGS,
]

# Fine-grained event kinds (free-form; the frontend only needs `category` to
# render, these are for analytics / future filtering).
EVENT_INVITE_ACCEPTED = "invite_accepted"
EVENT_INVOICE_ISSUED = "invoice_issued"
EVENT_INVOICE_PAID = "invoice_paid"
EVENT_PROJECT_ADDED = "project_added"
EVENT_TASK_ASSIGNED = "task_assigned"
EVENT_MENTION = "mention"
EVENT_CANVAS_COMMENT = "canvas_comment"
EVENT_MEETING_BOOKED = "meeting_booked"
EVENT_MEETING_SCHEDULED = "meeting_scheduled"
EVENT_MEETING_CANCELLED = "meeting_cancelled"


# A single in-app notification for one recipient. Notifications are per-user
# and span every agency the person belongs to (the dropdown and the
# /notifications page show them all); `agency_id` is kept only for context
# labelling and cascade cleanup. Actor name is snapshotted like
# Message.sender_name so history still reads correctly after someone leaves.
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    agency_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agencies.id", ondelete="CASCADE"), default=None, index=True
    )

    category: Mapped[str] = mapped_column(String(50))
    event_type: Mapped[str] = mapped_column(String(50))

    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(String(1024), default=None)
    # A frontend-relative path to open when the row is clicked, e.g.
    # "/invoices/{id}". Nullable — some notifications are purely informational.
    link: Mapped[str | None] = mapped_column(String(512), default=None)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    actor_name: Mapped[str | None] = mapped_column(String(255), default=None)

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
