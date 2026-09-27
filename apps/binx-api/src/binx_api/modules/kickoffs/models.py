"""Project kickoffs: a form-style question set staff send a client to answer
before/while work starts, so expectations get set explicitly instead of
being inferred from a sales call. One Kickoff per Project (create raises a
409 if one already exists — see service.create_kickoff), same "one per
parent" shape as ProjectBoard.

A KickoffTemplate is an agency-level reusable question set (mirrors how
ProjectRole/ProjectTag are agency-configured labels) — creating a Kickoff can
optionally copy a template's questions in as a starting point; after that the
two are unlinked, editing the template never touches kickoffs already
created from it.

``options``/``selected_options`` are JSON-encoded text (list[str]), same
convention as boards/models.py's BoardItem.content and leads.ai_talking_points
— avoids a DB-specific JSON column type for what's always read back through
the service layer anyway.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Question kinds. A plain string (not a DB enum), same reasoning as
# boards/models.py's BOARD_ITEM_TYPES — a new kind later needs no migration.
QUESTION_TEXT = "text"
QUESTION_MULTIPLE_CHOICE = "multiple_choice"
QUESTION_FILE_UPLOAD = "file_upload"

question_types: list[str] = [QUESTION_TEXT, QUESTION_MULTIPLE_CHOICE, QUESTION_FILE_UPLOAD]

STATUS_DRAFT = "draft"
STATUS_SENT = "sent"
STATUS_COMPLETED = "completed"

kickoff_statuses: list[str] = [STATUS_DRAFT, STATUS_SENT, STATUS_COMPLETED]


# A reusable question set staff can start a new project's kickoff from.
class KickoffTemplate(Base):
    __tablename__ = "kickoff_templates"
    __table_args__ = (UniqueConstraint("agency_id", "name", name="uq_kickoff_templates_agency_id_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(1024), default=None)


class KickoffTemplateQuestion(Base):
    __tablename__ = "kickoff_template_questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kickoff_templates.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20), default=QUESTION_TEXT)
    label: Mapped[str] = mapped_column(String(500))
    # JSON list[str] of choices — only meaningful for QUESTION_MULTIPLE_CHOICE.
    options: Mapped[str | None] = mapped_column(Text, default=None)
    required: Mapped[bool] = mapped_column(default=True)


# One project's kickoff. Frozen once sent, same "no edit after send" shape as
# Proposal — the client is answering a specific, fixed set of questions.
class Kickoff(Base):
    __tablename__ = "kickoffs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    title: Mapped[str] = mapped_column(String(255), default="Project kickoff")
    # Shown to the client above the questions, e.g. "A few questions to make
    # sure we're aligned before we start."
    intro_message: Mapped[str | None] = mapped_column(String(2000), default=None)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Bumped every time staff re-sends the nudge email (resend, not the
    # first send) — lets the UI show "last reminded 2 days ago" and rate-limit
    # nudges if that's ever needed. Not enforced yet.
    last_nudged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Set once converted, so the UI can show "already added to tasks" and
    # the endpoint can refuse to double-convert.
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class KickoffQuestion(Base):
    __tablename__ = "kickoff_questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kickoff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kickoffs.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20), default=QUESTION_TEXT)
    label: Mapped[str] = mapped_column(String(500))
    options: Mapped[str | None] = mapped_column(Text, default=None)
    required: Mapped[bool] = mapped_column(default=True)


# One client answer per question. Row only exists once answered — an
# unanswered required question is just a KickoffQuestion with no matching row
# here, same "absence means unanswered" shape as an unread Notification using
# a nullable read_at rather than a boolean.
class KickoffAnswer(Base):
    __tablename__ = "kickoff_answers"
    __table_args__ = (UniqueConstraint("question_id", name="uq_kickoff_answers_question_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kickoff_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kickoffs.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("kickoff_questions.id", ondelete="CASCADE"), index=True)
    answered_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    text_value: Mapped[str | None] = mapped_column(Text, default=None)
    # JSON list[str] — the chosen option(s) for a multiple_choice question.
    selected_options: Mapped[str | None] = mapped_column(Text, default=None)
    # Points at the project_files row created by the client's upload (see
    # client_portal/router.py's kickoff file endpoint, which reuses
    # projects_service.save_project_file). SET NULL: deleting the file from
    # the project just clears this pointer, it doesn't delete the answer.
    file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("project_files.id", ondelete="SET NULL"), default=None)

    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
