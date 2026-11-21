import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from binx_api.modules.timeline.models import COMMENT_MAX_CHARS, POST_MAX_CHARS

ReactionKey = Literal["like", "love", "celebrate", "laugh", "wow", "thanks"]


def _not_blank(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("Write something first")
    return stripped


class TimelineAuthor(BaseModel):
    user_id: uuid.UUID | None
    name: str
    # For the avatar route (/agencies/{id}/members/{member_id}/avatar); None
    # once the author has left the agency.
    member_id: uuid.UUID | None
    has_avatar: bool
    avatar_version: str | None
    role: str | None  # owner | admin | member, None for a former member


class TimelineReactionSummary(BaseModel):
    reaction: ReactionKey
    count: int
    reacted: bool  # whether the viewer is one of them
    names: list[str]  # who reacted (first few), for the tooltip


class TimelineCommentRead(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    author: TimelineAuthor
    body: str
    created_at: datetime
    edited_at: datetime | None
    can_edit: bool
    can_delete: bool


class TimelinePostRead(BaseModel):
    id: uuid.UUID
    author: TimelineAuthor
    body: str
    is_announcement: bool
    pinned: bool
    created_at: datetime
    edited_at: datetime | None
    reactions: list[TimelineReactionSummary]
    comment_count: int
    # The latest few comments, oldest first; GET .../comments has them all.
    recent_comments: list[TimelineCommentRead]
    can_edit: bool
    can_delete: bool
    can_pin: bool


class TimelineFeedRead(BaseModel):
    # Only on the first page (no cursor): pinned posts, most recently pinned
    # first. They're left out of `posts` so nothing shows twice.
    pinned: list[TimelinePostRead]
    posts: list[TimelinePostRead]
    next_cursor: str | None
    # Owners/admins see the announcement and pin controls.
    can_moderate: bool


class TimelinePostCreate(BaseModel):
    body: str = Field(max_length=POST_MAX_CHARS)
    # Owners/admins only: notifies every member.
    is_announcement: bool = False

    _body = field_validator("body")(_not_blank)


class TimelinePostUpdate(BaseModel):
    body: str = Field(max_length=POST_MAX_CHARS)

    _body = field_validator("body")(_not_blank)


class TimelinePinUpdate(BaseModel):
    pinned: bool


class TimelineCommentCreate(BaseModel):
    body: str = Field(max_length=COMMENT_MAX_CHARS)

    _body = field_validator("body")(_not_blank)


class TimelineCommentUpdate(TimelineCommentCreate):
    pass


# ---- Sidebar highlights ------------------------------------------------------


class TimelineUpcomingMeeting(BaseModel):
    id: uuid.UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    client_name: str


class TimelineCelebration(BaseModel):
    kind: Literal["joined", "anniversary"]
    person: TimelineAuthor
    # For the "Say congrats" draft's @mention.
    user_name: str
    # The day being celebrated: when they joined, or this year's anniversary.
    day: date
    years: int | None  # anniversaries only


class TimelineWin(BaseModel):
    id: uuid.UUID
    event_type: str
    summary: str
    target_type: str | None
    target_id: uuid.UUID | None
    created_at: datetime


class TimelineContributor(BaseModel):
    person: TimelineAuthor
    posts: int
    comments: int


class TimelineWeekStats(BaseModel):
    posts: int
    comments: int
    reactions: int
    top_contributors: list[TimelineContributor]


class TimelineHighlightsRead(BaseModel):
    """Everything the timeline's side rail shows, in one request."""

    upcoming_meetings: list[TimelineUpcomingMeeting]
    celebrations: list[TimelineCelebration]
    wins: list[TimelineWin]
    this_week: TimelineWeekStats
