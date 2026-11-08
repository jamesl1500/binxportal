import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

# file cards are created via the /files upload endpoint (image via /images,
# though "image" stays accepted here for back-compat).
_TYPE_PATTERN = "^(note|image|pin|todo|link|column|board|line)$"
_HEX_PATTERN = "^#[0-9a-fA-F]{6}$"
_APPROVAL_DECISION_PATTERN = "^(approved|changes_requested)$"


class BoardItemRead(BaseModel):
    id: uuid.UUID
    board_id: uuid.UUID
    type: str
    # Column membership — null on a free card; see BoardItem.parent_id.
    parent_id: uuid.UUID | None = None
    position: int = 0
    x: float
    y: float
    width: float
    height: float
    z: int
    content: dict[str, Any]
    color: str | None
    author_kind: str
    created_by_id: uuid.UUID | None
    created_by_name: str
    # Client-approval workflow — null status means never requested.
    approval_status: str | None = None
    approval_requested_by_name: str | None = None
    approval_decided_by_name: str | None = None
    approval_decided_at: datetime | None = None
    approval_note: str | None = None
    # Version pinning — null until approval has been requested at least once.
    # version_number is the most recent snapshot; approved_version_number is
    # the last one actually approved (see boards/models.py::BoardItemVersion).
    version_number: int | None = None
    approved_version_number: int | None = None
    # Filled from boards/service.py::item_meta on the board GET; the realtime
    # item events omit them and the frontend store keeps its own values.
    reactions: dict[str, int] = {}
    my_reactions: list[str] = []
    comment_count: int = 0
    # Board cards only (board GET): cards on the sub-board, and how many
    # cards anywhere beneath it await the client's review.
    child_count: int | None = None
    pending_count: int | None = None


class BoardCrumb(BaseModel):
    id: uuid.UUID
    # Null on the root board — the UI names it after the project.
    title: str | None


class BoardTaskRead(BaseModel):
    """A row on a to-do card — a ProjectTask, trimmed. ``done`` = the task is
    in the project's last Kanban list. Assignee fields are always null on
    the portal (clients never see who internally owns a task)."""

    id: uuid.UUID
    item_id: uuid.UUID | None
    title: str
    done: bool
    due_date: date | None
    position: int
    assignee_id: uuid.UUID | None = None
    assignee_name: str | None = None


class BoardRead(BaseModel):
    board_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    title: str | None = None
    # Root → this board.
    path: list[BoardCrumb] = []
    items: list[BoardItemRead]
    tasks: list[BoardTaskRead] = []


class BoardItemCreate(BaseModel):
    type: str = Field(pattern=_TYPE_PATTERN)
    # Which board to add to — the project's root board when omitted.
    board_id: uuid.UUID | None = None
    # Drop straight into a column (at `position`, or the end).
    parent_id: uuid.UUID | None = None
    position: int | None = Field(default=None, ge=0)
    x: float = 0.0
    y: float = 0.0
    width: float | None = Field(default=None, gt=0)
    height: float | None = Field(default=None, gt=0)
    # note -> {"text"}; todo/column/board -> {"title"}; link -> {"url"};
    # line -> {"from", "to", "x1", "y1", "x2", "y2", "arrow"}. image/file
    # cards are created via the /images and /files upload endpoints.
    content: dict[str, Any] = Field(default_factory=dict)
    color: str | None = Field(default=None, pattern=_HEX_PATTERN)


class BoardItemUpdate(BaseModel):
    """Every field optional — the canvas PATCHes just what changed (a drag
    sends x/y, a resize sends width/height, an edit sends content)."""

    x: float | None = None
    y: float | None = None
    width: float | None = Field(default=None, gt=0)
    height: float | None = Field(default=None, gt=0)
    z: int | None = None
    content: dict[str, Any] | None = None
    color: str | None = Field(default=None, pattern=_HEX_PATTERN)
    # Send clear_color=true to drop back to the default note colour (a null
    # `color` alone is indistinguishable from "not provided").
    clear_color: bool = False
    # Column membership: parent_id (+ position) drops the card into a column;
    # clear_parent=true takes it back out onto the board (send x/y too).
    # position alone reorders it within its current column.
    parent_id: uuid.UUID | None = None
    clear_parent: bool = False
    position: int | None = Field(default=None, ge=0)
    # Move the card (a column brings its stack) onto another of the
    # project's boards — dropping it onto a board card.
    board_id: uuid.UUID | None = None


class BoardReactionToggle(BaseModel):
    kind: str = Field(min_length=1, max_length=16)


class BoardReactionsRead(BaseModel):
    reactions: dict[str, int]
    my_reactions: list[str]


class BoardCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class BoardCommentRead(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    author_kind: str
    author_user_id: uuid.UUID | None
    author_name: str
    body: str
    created_at: datetime


class BoardApprovalDecision(BaseModel):
    """A client-portal contact's decision on a pending approval request."""

    status: str = Field(pattern=_APPROVAL_DECISION_PATTERN)
    note: str | None = Field(default=None, max_length=2000)


class BoardItemVersionRead(BaseModel):
    """One immutable approval-cycle snapshot — see BoardItemVersion."""

    id: uuid.UUID
    item_id: uuid.UUID
    version_number: int
    content: dict[str, Any]
    color: str | None
    status: str
    requested_by_name: str | None
    decided_by_name: str | None
    decided_at: datetime | None
    note: str | None
    created_at: datetime


class BoardTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class BoardTaskUpdate(BaseModel):
    """Every field optional — a tick sends ``done``, an inline rename sends
    ``title``, a drag sends ``position``."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    done: bool | None = None
    due_date: date | None = None
    clear_due_date: bool = False
    assignee_id: uuid.UUID | None = None
    clear_assignee: bool = False
    position: int | None = Field(default=None, ge=0)


class BoardTaskAttach(BaseModel):
    task_id: uuid.UUID
