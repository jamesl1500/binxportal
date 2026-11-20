"""
The team timeline (see models.py for the rules). Reads are batched so a page
of 20 posts is a fixed handful of queries: posts, authors, reactions,
comment counts, and each post's latest comments.

Notifications (each through notifications_service, so per-category mutes
apply and nobody is notified about their own action):
- comment on your post -> ``timeline`` category;
- reaction on your post -> ``timeline`` (only someone's first reaction on a
  post, so toggling emoji doesn't spam);
- @mention in a post or comment -> ``messages`` (the "Mentions" toggle, the
  same as messaging); on an edit, only newly mentioned people;
- announcement -> every member, ``team`` category, so muting the chattier
  timeline category doesn't silence announcements.
"""

from __future__ import annotations

import base64
import re
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from binx_api.core.database import execute_dml
from binx_api.core.images import image_version
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_TEAM as ACTIVITY_CATEGORY_TEAM
from binx_api.modules.activity.models import VISIBILITY_ADMIN
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_OWNER, Agency, AgencyMember
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import (
    CATEGORY_MESSAGES,
    CATEGORY_TEAM,
    CATEGORY_TIMELINE,
    EVENT_MENTION,
)
from binx_api.modules.timeline.models import TimelineComment, TimelinePost, TimelineReaction
from binx_api.modules.timeline.schemas import (
    ReactionKey,
    TimelineAuthor,
    TimelineCommentRead,
    TimelineFeedRead,
    TimelinePostRead,
    TimelineReactionSummary,
)
from binx_api.modules.users.models import User, UserProfile

PAGE_SIZE = 20
RECENT_COMMENTS = 3
REACTION_NAMES_SHOWN = 10

EVENT_TIMELINE_COMMENT = "timeline_comment"
EVENT_TIMELINE_REACTION = "timeline_reaction"
EVENT_TIMELINE_ANNOUNCEMENT = "timeline_announcement"

# Same handle syntax as messaging/service.py::_MENTION_RE, so a mention is
# written (and highlighted) the same way everywhere.
_MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9_.-]{2,255})")

_REACTION_ORDER: list[ReactionKey] = ["like", "love", "celebrate", "laugh", "wow", "thanks"]


def is_moderator(role: str) -> bool:
    return role in (ROLE_OWNER, ROLE_ADMIN)


def _now() -> datetime:
    return datetime.now(UTC)


def _preview(body: str, length: int = 140) -> str:
    flat = " ".join(body.split())
    return flat if len(flat) <= length else f"{flat[: length - 1]}…"


def _post_link(post_id: uuid.UUID) -> str:
    return f"/dashboard/timeline#post-{post_id}"


# ---- Lookups ----------------------------------------------------------------


async def get_post_or_404(db: AsyncSession, agency_id: uuid.UUID, post_id: uuid.UUID) -> TimelinePost:
    post = await db.get(TimelinePost, post_id)
    if post is None or post.agency_id != agency_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


async def get_comment_or_404(
    db: AsyncSession, agency_id: uuid.UUID, comment_id: uuid.UUID
) -> tuple[TimelineComment, TimelinePost]:
    row = (
        await db.execute(
            select(TimelineComment, TimelinePost)
            .join(TimelinePost, TimelinePost.id == TimelineComment.post_id)
            .where(TimelineComment.id == comment_id, TimelinePost.agency_id == agency_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return row[0], row[1]


async def _authors(db: AsyncSession, agency_id: uuid.UUID, user_ids: Iterable[uuid.UUID | None]) -> dict:
    ids = {user_id for user_id in user_ids if user_id}
    if not ids:
        return {}
    result = await db.execute(
        select(User, AgencyMember, UserProfile)
        .outerjoin(AgencyMember, and_(AgencyMember.user_id == User.id, AgencyMember.agency_id == agency_id))
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .where(User.id.in_(ids))
    )
    authors: dict[uuid.UUID, TimelineAuthor] = {}
    for user, member, profile in result.all():
        avatar = profile.avatar_storage_path if profile and member else None
        authors[user.id] = TimelineAuthor(
            user_id=user.id,
            name=user.full_name,
            member_id=member.id if member else None,
            has_avatar=avatar is not None,
            avatar_version=image_version(avatar),
            role=member.role if member else None,
        )
    return authors


def _author(authors: dict, user_id: uuid.UUID | None) -> TimelineAuthor:
    if user_id and user_id in authors:
        return authors[user_id]
    return TimelineAuthor(
        user_id=None, name="Former member", member_id=None, has_avatar=False, avatar_version=None, role=None
    )


def _comment_read(comment: TimelineComment, authors: dict, *, viewer: User, role: str) -> TimelineCommentRead:
    mine = comment.author_id == viewer.id
    return TimelineCommentRead(
        id=comment.id,
        post_id=comment.post_id,
        author=_author(authors, comment.author_id),
        body=comment.body,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        can_edit=mine,
        can_delete=mine or is_moderator(role),
    )


async def build_post_reads(
    db: AsyncSession, agency_id: uuid.UUID, posts: list[TimelinePost], *, viewer: User, role: str
) -> list[TimelinePostRead]:
    if not posts:
        return []
    post_ids = [post.id for post in posts]

    reaction_rows = await db.execute(
        select(TimelineReaction.post_id, TimelineReaction.reaction, TimelineReaction.user_id, User.full_name)
        .join(User, User.id == TimelineReaction.user_id)
        .where(TimelineReaction.post_id.in_(post_ids))
        .order_by(TimelineReaction.created_at)
    )
    reactions: dict[uuid.UUID, dict[str, list[tuple[uuid.UUID, str]]]] = {}
    for post_id, reaction, user_id, name in reaction_rows.all():
        reactions.setdefault(post_id, {}).setdefault(reaction, []).append((user_id, name))

    counts = dict(
        (
            await db.execute(
                select(TimelineComment.post_id, func.count())
                .where(TimelineComment.post_id.in_(post_ids))
                .group_by(TimelineComment.post_id)
            )
        ).all()
    )

    # Each post's latest few comments in one query (row_number per post).
    ranked = (
        select(
            TimelineComment,
            func.row_number()
            .over(partition_by=TimelineComment.post_id, order_by=TimelineComment.created_at.desc())
            .label("rank"),
        )
        .where(TimelineComment.post_id.in_(post_ids))
        .subquery()
    )
    comment_alias = aliased(TimelineComment, ranked)
    recent_rows = await db.execute(
        select(comment_alias).where(ranked.c.rank <= RECENT_COMMENTS).order_by(comment_alias.created_at)
    )
    recent: dict[uuid.UUID, list[TimelineComment]] = {}
    for comment in recent_rows.scalars().all():
        recent.setdefault(comment.post_id, []).append(comment)

    authors = await _authors(
        db,
        agency_id,
        [post.author_id for post in posts] + [c.author_id for comments in recent.values() for c in comments],
    )

    reads = []
    for post in posts:
        mine = post.author_id == viewer.id
        by_kind = reactions.get(post.id, {})
        reads.append(
            TimelinePostRead(
                id=post.id,
                author=_author(authors, post.author_id),
                body=post.body,
                is_announcement=post.is_announcement,
                pinned=post.pinned_at is not None,
                created_at=post.created_at,
                edited_at=post.edited_at,
                reactions=[
                    TimelineReactionSummary(
                        reaction=kind,
                        count=len(by_kind[kind]),
                        reacted=any(user_id == viewer.id for user_id, _ in by_kind[kind]),
                        names=[name for _, name in by_kind[kind][:REACTION_NAMES_SHOWN]],
                    )
                    for kind in _REACTION_ORDER
                    if by_kind.get(kind)
                ],
                comment_count=int(counts.get(post.id, 0)),
                recent_comments=[
                    _comment_read(comment, authors, viewer=viewer, role=role) for comment in recent.get(post.id, [])
                ],
                can_edit=mine,
                can_delete=mine or is_moderator(role),
                can_pin=is_moderator(role),
            )
        )
    return reads


# ---- Feed ---------------------------------------------------------------------


def _encode_cursor(post: TimelinePost) -> str:
    # base64url: an ISO timestamp's "+00:00" would otherwise turn into a
    # space in a query string.
    raw = f"{post.created_at.isoformat()}|{post.id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        stamp, post_id = raw.split("|", 1)
        return datetime.fromisoformat(stamp), uuid.UUID(post_id)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from None


async def list_feed(
    db: AsyncSession, agency: Agency, *, viewer: User, role: str, cursor: str | None, limit: int = PAGE_SIZE
) -> TimelineFeedRead:
    query = select(TimelinePost).where(TimelinePost.agency_id == agency.id, TimelinePost.pinned_at.is_(None))
    if cursor:
        stamp, post_id = _decode_cursor(cursor)
        query = query.where(
            or_(
                TimelinePost.created_at < stamp,
                and_(TimelinePost.created_at == stamp, TimelinePost.id < post_id),
            )
        )
    rows = (
        (await db.execute(query.order_by(TimelinePost.created_at.desc(), TimelinePost.id.desc()).limit(limit + 1)))
        .scalars()
        .all()
    )
    page, more = list(rows[:limit]), len(rows) > limit

    pinned: list[TimelinePost] = []
    if not cursor:
        pinned = list(
            (
                await db.execute(
                    select(TimelinePost)
                    .where(TimelinePost.agency_id == agency.id, TimelinePost.pinned_at.is_not(None))
                    .order_by(TimelinePost.pinned_at.desc())
                )
            )
            .scalars()
            .all()
        )

    reads = await build_post_reads(db, agency.id, pinned + page, viewer=viewer, role=role)
    return TimelineFeedRead(
        pinned=reads[: len(pinned)],
        posts=reads[len(pinned) :],
        next_cursor=_encode_cursor(page[-1]) if more and page else None,
        can_moderate=is_moderator(role),
    )


async def read_post(db: AsyncSession, post: TimelinePost, *, viewer: User, role: str) -> TimelinePostRead:
    return (await build_post_reads(db, post.agency_id, [post], viewer=viewer, role=role))[0]


# ---- Mentions -----------------------------------------------------------------


def _handles(body: str) -> set[str]:
    return {match.group(1).lower() for match in _MENTION_RE.finditer(body)}


async def _mentioned_members(db: AsyncSession, agency_id: uuid.UUID, handles: set[str]) -> list[uuid.UUID]:
    if not handles:
        return []
    result = await db.execute(
        select(User.id)
        .join(AgencyMember, AgencyMember.user_id == User.id)
        .where(AgencyMember.agency_id == agency_id, func.lower(User.user_name).in_(handles))
    )
    return list(result.scalars().all())


async def _notify_mentions(
    db: AsyncSession, agency_id: uuid.UUID, user_ids: list[uuid.UUID], *, actor: User, where: str, body: str, link: str
) -> None:
    if user_ids:
        await notifications_service.notify_many(
            db,
            user_ids=user_ids,
            category=CATEGORY_MESSAGES,
            event_type=EVENT_MENTION,
            title=f"{actor.full_name} mentioned you",
            body=f"{where}: “{_preview(body)}”",
            link=link,
            agency_id=agency_id,
            actor=actor,
        )


async def _agency_member_ids(db: AsyncSession, agency_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(select(AgencyMember.user_id).where(AgencyMember.agency_id == agency_id))
    return list(result.scalars().all())


# ---- Posts --------------------------------------------------------------------


def _require_author(owner_id: uuid.UUID | None, user: User, noun: str) -> None:
    if owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only the author can edit this {noun}")


def _require_author_or_moderator(owner_id: uuid.UUID | None, user: User, role: str, noun: str) -> None:
    if owner_id != user.id and not is_moderator(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only delete your own {noun}")


async def create_post(
    db: AsyncSession, agency: Agency, *, author: User, role: str, body: str, is_announcement: bool
) -> TimelinePost:
    if is_announcement and not is_moderator(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners and admins can post announcements")
    # created_at set here, not by the database: CURRENT_TIMESTAMP is the
    # transaction's start time, and feed order (and its cursor) needs a
    # precise one.
    post = TimelinePost(
        agency_id=agency.id, author_id=author.id, body=body, is_announcement=is_announcement, created_at=_now()
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    mentioned = await _mentioned_members(db, agency.id, _handles(body))
    link = _post_link(post.id)
    if is_announcement:
        everyone = await _agency_member_ids(db, agency.id)
        await notifications_service.notify_many(
            db,
            user_ids=everyone,
            category=CATEGORY_TEAM,
            event_type=EVENT_TIMELINE_ANNOUNCEMENT,
            title=f"Announcement from {author.full_name}",
            body=_preview(body),
            link=link,
            agency_id=agency.id,
            actor=author,
        )
        # Everyone already heard about it; no separate mention notification.
        return post
    await _notify_mentions(db, agency.id, mentioned, actor=author, where="In a timeline post", body=body, link=link)
    return post


async def update_post(db: AsyncSession, post: TimelinePost, *, editor: User, body: str) -> TimelinePost:
    _require_author(post.author_id, editor, "post")
    newly_mentioned = _handles(body) - _handles(post.body)
    post.body = body
    post.edited_at = _now()
    await db.commit()
    await db.refresh(post)
    if not post.is_announcement:
        mentioned = await _mentioned_members(db, post.agency_id, newly_mentioned)
        await _notify_mentions(
            db, post.agency_id, mentioned, actor=editor, where="In a timeline post", body=body, link=_post_link(post.id)
        )
    return post


async def delete_post(db: AsyncSession, post: TimelinePost, *, actor: User, role: str) -> None:
    _require_author_or_moderator(post.author_id, actor, role, "posts")
    removed_someone_elses = post.author_id != actor.id
    author_name = (await db.get(User, post.author_id)).full_name if post.author_id else "a former member"
    agency_id = post.agency_id
    await db.delete(post)
    await db.commit()
    if removed_someone_elses:
        await activity_service.log_agency_activity(
            db,
            agency_id,
            category=ACTIVITY_CATEGORY_TEAM,
            event_type="timeline_post_removed",
            summary=f"{actor.full_name} removed a timeline post by {author_name}",
            visibility=VISIBILITY_ADMIN,
            actor=actor,
        )


async def set_pinned(db: AsyncSession, post: TimelinePost, *, actor: User, role: str, pinned: bool) -> TimelinePost:
    if not is_moderator(role):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners and admins can pin posts")
    post.pinned_at = _now() if pinned else None
    post.pinned_by_id = actor.id if pinned else None
    await db.commit()
    await db.refresh(post)
    return post


# ---- Comments -----------------------------------------------------------------


async def list_comments(db: AsyncSession, post: TimelinePost, *, viewer: User, role: str) -> list[TimelineCommentRead]:
    comments = (
        (
            await db.execute(
                select(TimelineComment)
                .where(TimelineComment.post_id == post.id)
                .order_by(TimelineComment.created_at, TimelineComment.id)
            )
        )
        .scalars()
        .all()
    )
    authors = await _authors(db, post.agency_id, [comment.author_id for comment in comments])
    return [_comment_read(comment, authors, viewer=viewer, role=role) for comment in comments]


async def read_comment(
    db: AsyncSession, comment: TimelineComment, post: TimelinePost, *, viewer: User, role: str
) -> TimelineCommentRead:
    authors = await _authors(db, post.agency_id, [comment.author_id])
    return _comment_read(comment, authors, viewer=viewer, role=role)


async def create_comment(db: AsyncSession, post: TimelinePost, *, author: User, body: str) -> TimelineComment:
    comment = TimelineComment(post_id=post.id, author_id=author.id, body=body, created_at=_now())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    link = _post_link(post.id)
    mentioned = await _mentioned_members(db, post.agency_id, _handles(body))
    await _notify_mentions(db, post.agency_id, mentioned, actor=author, where="In a comment", body=body, link=link)
    # The post's author hears about the comment — unless the mention just
    # told them (or it's their own comment; notify_many skips the actor).
    if post.author_id and post.author_id not in mentioned:
        await notifications_service.notify(
            db,
            user_id=post.author_id,
            category=CATEGORY_TIMELINE,
            event_type=EVENT_TIMELINE_COMMENT,
            title=f"{author.full_name} commented on your post",
            body=_preview(body),
            link=link,
            agency_id=post.agency_id,
            actor=author,
        )
    return comment


async def update_comment(
    db: AsyncSession, comment: TimelineComment, post: TimelinePost, *, editor: User, body: str
) -> TimelineComment:
    _require_author(comment.author_id, editor, "comment")
    newly_mentioned = _handles(body) - _handles(comment.body)
    comment.body = body
    comment.edited_at = _now()
    await db.commit()
    await db.refresh(comment)
    mentioned = await _mentioned_members(db, post.agency_id, newly_mentioned)
    await _notify_mentions(
        db, post.agency_id, mentioned, actor=editor, where="In a comment", body=body, link=_post_link(post.id)
    )
    return comment


async def delete_comment(
    db: AsyncSession, comment: TimelineComment, post: TimelinePost, *, actor: User, role: str
) -> None:
    _require_author_or_moderator(comment.author_id, actor, role, "comments")
    removed_someone_elses = comment.author_id != actor.id
    author_name = (await db.get(User, comment.author_id)).full_name if comment.author_id else "a former member"
    await db.delete(comment)
    await db.commit()
    if removed_someone_elses:
        await activity_service.log_agency_activity(
            db,
            post.agency_id,
            category=ACTIVITY_CATEGORY_TEAM,
            event_type="timeline_comment_removed",
            summary=f"{actor.full_name} removed a timeline comment by {author_name}",
            visibility=VISIBILITY_ADMIN,
            actor=actor,
        )


# ---- Reactions ----------------------------------------------------------------


async def add_reaction(db: AsyncSession, post: TimelinePost, *, user: User, reaction: str) -> None:
    had_reacted = (
        await db.execute(
            select(func.count())
            .select_from(TimelineReaction)
            .where(TimelineReaction.post_id == post.id, TimelineReaction.user_id == user.id)
        )
    ).scalar_one() > 0
    # ON CONFLICT DO NOTHING: reacting twice the same way is a no-op, without
    # an IntegrityError + rollback (which would expire `post` mid-request).
    inserted = await execute_dml(
        db,
        pg_insert(TimelineReaction)
        .values(id=uuid.uuid4(), post_id=post.id, user_id=user.id, reaction=reaction)
        .on_conflict_do_nothing(constraint="uq_timeline_reactions_post_user"),
    )
    await db.commit()
    if inserted.rowcount and post.author_id and not had_reacted:
        await notifications_service.notify(
            db,
            user_id=post.author_id,
            category=CATEGORY_TIMELINE,
            event_type=EVENT_TIMELINE_REACTION,
            title=f"{user.full_name} reacted to your post",
            body=_preview(post.body),
            link=_post_link(post.id),
            agency_id=post.agency_id,
            actor=user,
        )


async def remove_reaction(db: AsyncSession, post: TimelinePost, *, user: User, reaction: str) -> None:
    existing = (
        await db.execute(
            select(TimelineReaction).where(
                TimelineReaction.post_id == post.id,
                TimelineReaction.user_id == user.id,
                TimelineReaction.reaction == reaction,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.commit()
