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

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Card kinds. Kept a plain string (not a DB enum) so adding "link" / "checklist"
# later needs no migration — only a `content` shape and some frontend.
# "pin" is a small, fixed-size marker that exists only to anchor a comment
# thread (service.py::add_comment) to a specific spot on the board — Miro's
# "drop a comment anywhere" — rather than only to a note/image card. It has
# no content of its own and never takes part in the approval workflow.
ITEM_NOTE = "note"
ITEM_IMAGE = "image"
ITEM_PIN = "pin"
# Milanote-style card kinds:
# - "todo": a checklist whose rows are real ProjectTasks (ProjectTask.board_item_id
#   points back here), so ticking one on the canvas moves it to the last Kanban
#   list and vice versa. content -> {"title"}.
# - "link": a URL with a server-fetched preview. content -> {"url", "title",
#   "description", "image", "site_name"}.
# - "file": any non-image upload (PDF, doc...). content -> {"file_id",
#   "file_name", "mime_type", "size"}. Stored as a ProjectFile like images.
# - "column": a vertical stack other cards snap into (their parent_id points
#   at it, ordered by position). content -> {"title"}.
# - "board": a card that opens a nested ProjectBoard. content -> {"board_id", "title"}.
# - "line": an arrow/connector between two cards (or free points). content ->
#   {"from", "to", "x1", "y1", "x2", "y2", "arrow"}; x/y/width/height hold
#   its bounding box so the minimap and fit-to-view treat it like any card.
ITEM_TODO = "todo"
ITEM_LINK = "link"
ITEM_FILE = "file"
ITEM_COLUMN = "column"
ITEM_BOARD = "board"
ITEM_LINE = "line"
BOARD_ITEM_TYPES: list[str] = [
    ITEM_NOTE,
    ITEM_IMAGE,
    ITEM_PIN,
    ITEM_TODO,
    ITEM_LINK,
    ITEM_FILE,
    ITEM_COLUMN,
    ITEM_BOARD,
    ITEM_LINE,
]
# What a column may hold — no nested columns, and pins/lines are positional
# by nature so they stay on the open board.
COLUMN_CHILD_TYPES: set[str] = {ITEM_NOTE, ITEM_IMAGE, ITEM_TODO, ITEM_LINK, ITEM_FILE, ITEM_BOARD}
# Cards a client can be asked to approve. A column's own approval request fans
# out to its approvable children (see service.request_approval).
APPROVABLE_TYPES: set[str] = {ITEM_NOTE, ITEM_IMAGE, ITEM_LINK, ITEM_FILE}
# Only agency members create to-do cards — their rows are agency tasks.
AGENCY_ONLY_TYPES: set[str] = {ITEM_TODO}
LINE_ARROWS: list[str] = ["none", "end", "both"]

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
DEFAULT_COLUMN_WIDTH = 260.0
# Nested boards can go this deep (root = 1) — keeps breadcrumbs and the
# recursive pending-count walk bounded.
MAX_BOARD_DEPTH = 8
# A pin is always this size — fixed, not resizable (see service.create_item).
# Taller than wide: it renders as a map-pin teardrop (round head + a pointed
# tail), and the tail's tip — not the bounding box's center — is the anchored
# spot, same convention as a map pin's drop point.
DEFAULT_PIN_WIDTH = 28.0
DEFAULT_PIN_HEIGHT = 36.0

# The fixed reaction set — one of each per person per card. The emoji char is
# stored directly as ``kind``; a new emoji here needs no migration.
REACTION_KINDS: list[str] = ["👍", "❤️", "🎉", "👀", "🚀"]

# Client-approval workflow on a card. Null means no approval was ever
# requested. An agency member requests/withdraws; only a client-portal
# contact decides (approves or asks for changes) — see boards/service.py.
# Every request pins a BoardItemVersion snapshot of the card's content at
# that moment, so "what did the client actually sign off on" never drifts
# even if the card is edited later.
APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_CHANGES_REQUESTED = "changes_requested"
BOARD_APPROVAL_STATUSES: list[str] = [APPROVAL_PENDING, APPROVAL_APPROVED, APPROVAL_CHANGES_REQUESTED]


# A canvas. Each project has exactly one root board (parent_id null — the
# partial unique index enforces it) and any number of nested boards, each
# opened from a "board" card on its parent (Milanote's boards-in-boards).
# Deleting a board cascades to its sub-boards via parent_id.
class ProjectBoard(Base):
    __tablename__ = "project_boards"
    __table_args__ = (
        Index(
            "uq_project_boards_root",
            "project_id",
            unique=True,
            postgresql_where=text("parent_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_boards.id", ondelete="CASCADE"), index=True, default=None
    )
    # Null on the root board (the UI calls it after the project).
    title: Mapped[str | None] = mapped_column(String(120), default=None)


# A single card on the canvas.
class BoardItem(Base):
    __tablename__ = "board_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("project_boards.id", ondelete="CASCADE"), index=True)

    type: Mapped[str] = mapped_column(String(20))

    # Column membership: a card inside a column has parent_id = the column's id
    # and is laid out by `position` (its own x/y are ignored until it's dragged
    # back out). SET NULL is only a backstop — delete_item releases children
    # onto the board explicitly.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("board_items.id", ondelete="SET NULL"), index=True, default=None
    )
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

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

    # Version counters — see BoardItemVersion below. Null until the card's
    # approval is requested for the first time. version_number is the most
    # recent snapshot (whatever its decision); approved_version_number is the
    # last one a client actually approved, and keeps pointing at it even after
    # a later edit reopens the card for re-approval, so "the approved version"
    # always resolves to an immutable snapshot rather than the live content.
    version_number: Mapped[int | None] = mapped_column(Integer, default=None)
    approved_version_number: Mapped[int | None] = mapped_column(Integer, default=None)


# An immutable snapshot of a card's content + colour, taken every time an
# agency member requests approval. Pinned by (item_id, version_number), never
# mutated once decided — only its decision fields (status/decided_*/note) get
# filled in when the client responds. This is what lets everyone answer
# "exactly which version did the client approve" even after the card moves on.
class BoardItemVersion(Base):
    __tablename__ = "board_item_versions"
    __table_args__ = (UniqueConstraint("item_id", "version_number", name="uq_board_item_versions_item_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_items.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)

    # Snapshotted at request time — the card's substance, not its position
    # (dragging/resizing never creates a new version).
    content: Mapped[str] = mapped_column(Text, default="{}")
    color: Mapped[str | None] = mapped_column(String(7), default=None)

    status: Mapped[str] = mapped_column(String(20), default=APPROVAL_PENDING)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    requested_by_name: Mapped[str | None] = mapped_column(String(255), default=None)
    decided_by_name: Mapped[str | None] = mapped_column(String(255), default=None)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    note: Mapped[str | None] = mapped_column(String(2000), default=None)


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
