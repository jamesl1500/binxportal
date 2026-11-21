"""
The team timeline: one shared feed per agency, on the staff dashboard.

Any member can post, comment and react. Authors edit and delete their own
posts and comments; owners/admins can also remove anyone's (moderation), pin
posts to the top of the feed, and post announcements that notify everyone.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

POST_MAX_CHARS = 5000
COMMENT_MAX_CHARS = 2000

# Stored as keys rather than emoji (the frontend maps them), so the set is
# fixed and a typo'd or exotic emoji can't sneak in.
REACTIONS: dict[str, str] = {
    "like": "👍",
    "love": "❤️",
    "celebrate": "🎉",
    "laugh": "😂",
    "wow": "😮",
    "thanks": "🙏",
}


class TimelinePost(Base):
    __tablename__ = "timeline_posts"
    # The feed reads one agency's posts newest-first, pinned ones separately.
    __table_args__ = (Index("ix_timeline_posts_agency_created", "agency_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"))
    # SET NULL: a post outlives its author's account (shown as "Former member").
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    body: Mapped[str] = mapped_column(Text)
    is_announcement: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    pinned_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class TimelineComment(Base):
    __tablename__ = "timeline_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("timeline_posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(String(COMMENT_MAX_CHARS))
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class TimelineReaction(Base):
    __tablename__ = "timeline_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", "reaction", name="uq_timeline_reactions_post_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("timeline_posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    reaction: Mapped[str] = mapped_column(String(16))
