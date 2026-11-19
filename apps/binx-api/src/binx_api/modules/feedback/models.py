import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Product feedback about Binx itself — from agency staff (the "app" surface)
# and from their clients (the "portal" surface). It goes to the Binx team
# (platform admins, `User.role == "admin"`), never to the agency: a client
# writing about the portal is talking to the people who build it.

SURFACE_APP = "app"
SURFACE_PORTAL = "portal"
FEEDBACK_SURFACES: list[str] = [SURFACE_APP, SURFACE_PORTAL]

# What the person is telling us. "pulse" is reserved for answers to the
# new-customer check-in prompt (see FeedbackPulsePrompt below); the other four
# are what the open "Send feedback" dialog offers.
KIND_BUG = "bug"
KIND_IDEA = "idea"
KIND_PRAISE = "praise"
KIND_OTHER = "other"
KIND_PULSE = "pulse"
FEEDBACK_KINDS: list[str] = [KIND_BUG, KIND_IDEA, KIND_PRAISE, KIND_OTHER, KIND_PULSE]

# The triage lifecycle. "new" until a Binx admin looks at it; "done" and
# "declined" are the two closed states (what the submitter sees as resolved).
STATUS_NEW = "new"
STATUS_IN_REVIEW = "in_review"
STATUS_PLANNED = "planned"
STATUS_DONE = "done"
STATUS_DECLINED = "declined"
FEEDBACK_STATUSES: list[str] = [STATUS_NEW, STATUS_IN_REVIEW, STATUS_PLANNED, STATUS_DONE, STATUS_DECLINED]
FEEDBACK_OPEN_STATUSES: set[str] = {STATUS_NEW, STATUS_IN_REVIEW, STATUS_PLANNED}

# The check-in milestones, keyed on account age. Only the latest one a user
# has reached is ever offered — someone who signs up and comes back after six
# weeks sees "first-month", never a stale "first-week".
PULSE_MILESTONES: list[tuple[str, int]] = [("first-week", 3), ("first-month", 30)]

PULSE_ANSWERED = "answered"
PULSE_DISMISSED = "dismissed"


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    # Who sent it. SET NULL + snapshotted name/email so the inbox still reads
    # right (and the team can still reply) after an account is deleted.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None, index=True
    )
    user_name: Mapped[str] = mapped_column(String(255))
    user_email: Mapped[str] = mapped_column(String(255))

    # Where they were. `agency_id` is the agency they were working in (staff)
    # or the agency whose portal they were in (client); `client_id` only for
    # portal feedback. Context for triage, not access control.
    surface: Mapped[str] = mapped_column(String(16))
    agency_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agencies.id", ondelete="SET NULL"), default=None, index=True
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agency_clients.id", ondelete="SET NULL"), default=None
    )

    kind: Mapped[str] = mapped_column(String(16), index=True)
    # 1–5, optional on open feedback, required on a pulse answer.
    rating: Mapped[int | None] = mapped_column(Integer, default=None)
    message: Mapped[str] = mapped_column(Text, default="")
    # The pulse milestone this answers ("first-week", ...), else NULL.
    pulse_key: Mapped[str | None] = mapped_column(String(32), default=None)

    # Captured automatically by the client — what a bug report needs and
    # nobody remembers to type.
    page_path: Mapped[str | None] = mapped_column(String(512), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(512), default=None)
    viewport: Mapped[str | None] = mapped_column(String(32), default=None)

    # "It's fine to follow up with me" — gates the reply email, not the
    # in-app reply (which the submitter can always see on their own list).
    allow_contact: Mapped[bool] = mapped_column(Boolean, default=True)

    status: Mapped[str] = mapped_column(String(16), default=STATUS_NEW, index=True)
    # Shown to the submitter.
    response: Mapped[str | None] = mapped_column(Text, default=None)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Binx-team only, never returned on the submitter's endpoints.
    internal_note: Mapped[str | None] = mapped_column(Text, default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


# One row per (user, milestone) once the check-in has been answered or
# dismissed, so it's never shown twice. Its own table rather than an id in
# UserTutorialProgress.dismissed_popups: that list is resent wholesale by the
# client, so a server-side append there would get overwritten.
class FeedbackPulsePrompt(Base):
    __tablename__ = "feedback_pulse_prompts"
    __table_args__ = (UniqueConstraint("user_id", "pulse_key", name="uq_feedback_pulse_prompts_user_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    pulse_key: Mapped[str] = mapped_column(String(32))
    outcome: Mapped[str] = mapped_column(String(16))
    feedback_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("feedback.id", ondelete="SET NULL"), default=None)
