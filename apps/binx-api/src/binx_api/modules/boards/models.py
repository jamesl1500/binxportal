"""The project collaboration canvas — a freeform, Milanote-style board that
the agency team and the client's portal contacts share.

One ``ProjectBoard`` per project (lazily created, same pattern as
``ai/models.py::AgencyAiSettings``). ``BoardItem`` rows are positioned by
absolute ``x``/``y`` with a ``width``/``height`` and a ``z`` stacking order;
``type`` + a JSON ``content`` blob keep new card kinds migration-free. Live
sync rides the messaging websocket infra (see ``boards/service.py`` and
``messaging/realtime.py``).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Card kinds. Kept a plain string (not a DB enum) so adding "link" / "checklist"
# later needs no migration — only a `content` shape and some frontend.
ITEM_NOTE = "note"
ITEM_IMAGE = "image"
BOARD_ITEM_TYPES: list[str] = [ITEM_NOTE, ITEM_IMAGE]

# Who created a card — mirrors ProjectTaskComment.author_type so the UI can
# badge a client-authored card.
AUTHOR_AGENCY = "agency"
AUTHOR_CLIENT = "client"
BOARD_AUTHOR_KINDS: list[str] = [AUTHOR_AGENCY, AUTHOR_CLIENT]

# Image cards accept only what a browser renders inline.
ALLOWED_BOARD_IMAGE_MIME_TYPES: set[str] = {"image/png", "image/jpeg", "image/webp", "image/gif"}

# Default geometry for a freshly-dropped note (canvas units == CSS px at zoom 1).
DEFAULT_NOTE_WIDTH = 220.0
DEFAULT_NOTE_HEIGHT = 160.0

# The fixed reaction set — one of each per person per card. The emoji char is
# stored directly as ``kind``; a new emoji here needs no migration.
REACTION_KINDS: list[str] = ["👍", "❤️", "🎉", "👀", "🚀"]

# Client-approval workflow on a card. Null means no approval was ever
# requested. An agency member requests/withdraws; only a client-portal
# contact decides (approves or asks for changes) — see boards/service.py.
APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_CHANGES_REQUESTED = "changes_requested"
BOARD_APPROVAL_STATUSES: list[str] = [APPROVAL_PENDING, APPROVAL_APPROVED, APPROVAL_CHANGES_REQUESTED]


# One canvas per project. A row (rather than hanging items straight off
# project_id) gives a stable board_id for the socket fan-out and room to grow
# to multiple boards later.
class ProjectBoard(Base):
    __tablename__ = "project_boards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True
    )


# A single card on the canvas.
class BoardItem(Base):
    __tablename__ = "board_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_boards.id", ondelete="CASCADE"), index=True)

    type: Mapped[str] = mapped_column(String(20))

    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    width: Mapped[float] = mapped_column(Float, default=DEFAULT_NOTE_WIDTH)
    height: Mapped[float] = mapped_column(Float, default=DEFAULT_NOTE_HEIGHT)
    z: Mapped[int] = mapped_column(Integer, default=0)

    # JSON. note -> {"text": "..."}; image -> {"file_id", "natural_width", "natural_height"}.
    content: Mapped[str] = mapped_column(Text, default="{}")
    # Note background swatch, e.g. "#fef3c7". Null = the default note colour.
    color: Mapped[str | None] = mapped_column(String(7), default=None)

    author_kind: Mapped[str] = mapped_column(String(10), default=AUTHOR_AGENCY)
    # SET NULL: a card outlives the member/contact who dropped it.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    # Snapshotted at write time (like ProjectTaskComment.author_name) so history
    # reads right after someone leaves the agency or the client.
    created_by_name: Mapped[str] = mapped_column(String(255))

    # Client-approval workflow — see BOARD_APPROVAL_STATUSES above. Names are
    # snapshotted (like created_by_name) so they read right after someone
    # leaves; approval_requested_by_id is kept live only to target the
    # "your card was decided" notification.
    approval_status: Mapped[str | None] = mapped_column(String(20), default=None)
    approval_requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    approval_requested_by_name: Mapped[str | None] = mapped_column(String(255), default=None)
    approval_decided_by_name: Mapped[str | None] = mapped_column(String(255), default=None)
    approval_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # The client's feedback when requesting changes (or an optional note on approval).
    approval_note: Mapped[str | None] = mapped_column(String(2000), default=None)


# One emoji reaction on a card by one person. Toggled on/off; the unique
# constraint makes "already reacted" a no-op the service turns into a removal.
class BoardItemReaction(Base):
    __tablename__ = "board_item_reactions"
    __table_args__ = (UniqueConstraint("item_id", "user_id", "kind", name="uq_board_item_reactions_item_user_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_items.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))


# A text comment on a card — shaped like ProjectTaskComment (snapshotted
# author_name so it survives the author leaving), minus the attachment.
class BoardItemComment(Base):
    __tablename__ = "board_item_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_items.id", ondelete="CASCADE"), index=True)

    author_kind: Mapped[str] = mapped_column(String(10), default=AUTHOR_AGENCY)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    author_name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String(2000))
