import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

_TYPE_PATTERN = "^(note|image)$"
_HEX_PATTERN = "^#[0-9a-fA-F]{6}$"


class BoardItemRead(BaseModel):
    id: uuid.UUID
    board_id: uuid.UUID
    type: str
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
    # Filled from boards/service.py::item_meta on the board GET; the realtime
    # item events omit them and the frontend store keeps its own values.
    reactions: dict[str, int] = {}
    my_reactions: list[str] = []
    comment_count: int = 0


class BoardRead(BaseModel):
    board_id: uuid.UUID
    items: list[BoardItemRead]


class BoardItemCreate(BaseModel):
    type: str = Field(pattern=_TYPE_PATTERN)
    x: float = 0.0
    y: float = 0.0
    width: float | None = Field(default=None, gt=0)
    height: float | None = Field(default=None, gt=0)
    # note -> {"text": "..."}. image items are created via the /images endpoint.
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
