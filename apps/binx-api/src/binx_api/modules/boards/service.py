"""Collaboration-canvas service. Every mutation commits, then fans the change
out over the messaging websocket infra (``realtime.manager``) to the project's
agency members and the client's portal contacts — the HTTP response and the
live event carry the same data. Nothing imports this module, so it can import
``projects``/``client_portal``/``messaging`` services freely.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_OWNER, AgencyMember
from binx_api.modules.boards.models import (
    ALLOWED_BOARD_IMAGE_MIME_TYPES,
    APPROVAL_APPROVED,
    APPROVAL_PENDING,
    AUTHOR_AGENCY,
    DEFAULT_NOTE_HEIGHT,
    DEFAULT_NOTE_WIDTH,
    ITEM_IMAGE,
    ITEM_NOTE,
    REACTION_KINDS,
    BoardItem,
    BoardItemComment,
    BoardItemReaction,
    ProjectBoard,
)
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.messaging import realtime
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS, EVENT_CANVAS_APPROVAL, EVENT_CANVAS_COMMENT
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import Project, ProjectFile
from binx_api.modules.users.models import User

# Keep a runaway canvas (or a script) from filling the table.
MAX_ITEMS_PER_BOARD = 500
# Clamp geometry to sane bounds server-side (the client also clamps).
_MIN_SIZE = 60.0
_MAX_SIZE = 4000.0
_MAX_COORD = 100_000.0


async def get_or_create_board(db: AsyncSession, project: Project) -> ProjectBoard:
    result = await db.execute(select(ProjectBoard).where(ProjectBoard.project_id == project.id))
    board = result.scalar_one_or_none()
    if board is not None:
        return board

    board = ProjectBoard(project_id=project.id)
    db.add(board)
    try:
        await db.commit()
    except IntegrityError:
        # Two first-visits raced — the loser reads the winner's row.
        await db.rollback()
        result = await db.execute(select(ProjectBoard).where(ProjectBoard.project_id == project.id))
        return result.scalar_one()
    await db.refresh(board)
    return board


async def list_items(db: AsyncSession, board_id: uuid.UUID) -> list[BoardItem]:
    result = await db.execute(select(BoardItem).where(BoardItem.board_id == board_id).order_by(BoardItem.z))
    return list(result.scalars().all())


async def get_item_or_404(db: AsyncSession, board_id: uuid.UUID, item_id: uuid.UUID) -> BoardItem:
    result = await db.execute(select(BoardItem).where(BoardItem.id == item_id, BoardItem.board_id == board_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return item


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


async def _next_z(db: AsyncSession, board_id: uuid.UUID) -> int:
    result = await db.execute(select(func.coalesce(func.max(BoardItem.z), 0)).where(BoardItem.board_id == board_id))
    return int(result.scalar_one()) + 1


async def _recipient_user_ids(db: AsyncSession, project: Project) -> list[uuid.UUID]:
    """Everyone who might have the canvas open: the agency's members and the
    project client's portal contacts. Best-effort — send_to_users only touches
    users with a live socket."""
    members = await db.execute(select(AgencyMember.user_id).where(AgencyMember.agency_id == project.agency_id))
    contacts = await db.execute(select(ClientContact.user_id).where(ClientContact.client_id == project.client_id))
    return list({*members.scalars().all(), *contacts.scalars().all()})


async def _broadcast(db: AsyncSession, project: Project, board_id: uuid.UUID, event_type: str, data: dict) -> None:
    recipients = await _recipient_user_ids(db, project)
    await realtime.manager.send_to_users(recipients, {"type": event_type, "board_id": str(board_id), "data": data})


async def create_item(
    db: AsyncSession,
    board: ProjectBoard,
    project: Project,
    *,
    actor: User | None,
    author_kind: str = AUTHOR_AGENCY,
    type_: str,
    x: float,
    y: float,
    width: float | None,
    height: float | None,
    content: dict[str, Any],
    color: str | None,
) -> BoardItem:
    count = await db.execute(select(func.count()).select_from(BoardItem).where(BoardItem.board_id == board.id))
    if int(count.scalar_one()) >= MAX_ITEMS_PER_BOARD:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This canvas is full ({MAX_ITEMS_PER_BOARD} cards).")

    item = BoardItem(
        board_id=board.id,
        type=type_,
        x=_clamp(x, -_MAX_COORD, _MAX_COORD),
        y=_clamp(y, -_MAX_COORD, _MAX_COORD),
        width=_clamp(width or DEFAULT_NOTE_WIDTH, _MIN_SIZE, _MAX_SIZE),
        height=_clamp(height or DEFAULT_NOTE_HEIGHT, _MIN_SIZE, _MAX_SIZE),
        z=await _next_z(db, board.id),
        content=json.dumps(content),
        color=color,
        author_kind=author_kind,
        created_by_id=actor.id if actor else None,
        created_by_name=actor.full_name if actor else "Someone",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, board.id, realtime.EVENT_BOARD_ITEM_CREATED, _item_payload(item))
    return item


async def update_item(
    db: AsyncSession,
    item: BoardItem,
    project: Project,
    *,
    x: float | None = None,
    y: float | None = None,
    width: float | None = None,
    height: float | None = None,
    z: int | None = None,
    content: dict[str, Any] | None = None,
    color: str | None = None,
    clear_color: bool = False,
) -> BoardItem:
    if x is not None:
        item.x = _clamp(x, -_MAX_COORD, _MAX_COORD)
    if y is not None:
        item.y = _clamp(y, -_MAX_COORD, _MAX_COORD)
    if width is not None:
        item.width = _clamp(width, _MIN_SIZE, _MAX_SIZE)
    if height is not None:
        item.height = _clamp(height, _MIN_SIZE, _MAX_SIZE)
    if z is not None:
        item.z = z
    if content is not None:
        # Only the note text is client-editable; an image's file pointer is fixed.
        if item.type == ITEM_NOTE:
            item.content = json.dumps({"text": str(content.get("text", ""))})
    if clear_color:
        item.color = None
    elif color is not None:
        item.color = color

    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_ITEM_UPDATED, _item_payload(item))
    return item


async def delete_item(db: AsyncSession, item: BoardItem, project: Project) -> None:
    item_id, board_id = item.id, item.board_id
    await db.delete(item)
    await db.commit()
    await _broadcast(db, project, board_id, realtime.EVENT_BOARD_ITEM_DELETED, {"id": str(item_id)})


# ---- Client approval ---------------------------------------------------


async def request_approval(db: AsyncSession, item: BoardItem, project: Project, *, actor: User) -> BoardItem:
    """An agency member asks the client to review this card. Always resets to
    ``pending``, even if it was already decided — that's how a re-request
    after addressing feedback works."""
    item.approval_status = APPROVAL_PENDING
    item.approval_requested_by_id = actor.id
    item.approval_requested_by_name = actor.full_name
    item.approval_decided_by_name = None
    item.approval_decided_at = None
    item.approval_note = None
    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_ITEM_UPDATED, _item_payload(item))
    return item


async def withdraw_approval(db: AsyncSession, item: BoardItem, project: Project) -> BoardItem:
    """Clears the card's approval state entirely, whatever it currently is —
    an agency member changed their mind about asking, or wants to drop an
    old decision and start clean."""
    if item.approval_status is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This card has no approval request.")
    item.approval_status = None
    item.approval_requested_by_id = None
    item.approval_requested_by_name = None
    item.approval_decided_by_name = None
    item.approval_decided_at = None
    item.approval_note = None
    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_ITEM_UPDATED, _item_payload(item))
    return item


async def decide_approval(
    db: AsyncSession, item: BoardItem, project: Project, *, decider: User, decision: str, note: str | None
) -> BoardItem:
    """A client-portal contact approves or asks for changes on a card that's
    awaiting review. Notifies the agency member who requested it, same as a
    card comment notifies its author."""
    if item.approval_status != APPROVAL_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "This card isn't awaiting approval.")

    item.approval_status = decision
    item.approval_decided_by_name = decider.full_name
    item.approval_decided_at = datetime.now(UTC)
    item.approval_note = note.strip() if note else None
    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_ITEM_UPDATED, _item_payload(item))

    if item.approval_requested_by_id and item.approval_requested_by_id != decider.id:
        is_member = await db.execute(
            select(AgencyMember.id).where(
                AgencyMember.agency_id == project.agency_id, AgencyMember.user_id == item.approval_requested_by_id
            )
        )
        if is_member.scalar_one_or_none() is not None:
            verb = "approved" if decision == APPROVAL_APPROVED else "requested changes on"
            await notifications_service.notify(
                db,
                user_id=item.approval_requested_by_id,
                category=CATEGORY_PROJECTS,
                event_type=EVENT_CANVAS_APPROVAL,
                title=f"{decider.full_name} {verb} your card in {project.name}",
                body=item.approval_note[:280] if item.approval_note else None,
                link=f"/projects/{project.id}/canvas",
                agency_id=project.agency_id,
                actor=decider,
            )
    return item


async def save_board_image(
    db: AsyncSession, project: Project, *, uploaded_by: User, file_name: str, content: bytes, mime_type: str
) -> ProjectFile:
    """Store a canvas image as a normal ProjectFile (so it also shows on the
    project Files tab, like a task attachment). Restricted to browser-renderable
    image types — unlike a plain project file, which accepts anything."""
    if (mime_type or "").lower() not in ALLOWED_BOARD_IMAGE_MIME_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PNG, JPEG, WebP, or GIF images can be added.")
    return await projects_service.save_project_file(
        db, project, uploaded_by=uploaded_by, file_name=file_name, content=content, mime_type=mime_type
    )


def _item_payload(item: BoardItem) -> dict:
    """The wire shape shared by the HTTP response and the realtime event."""
    try:
        content = json.loads(item.content) if item.content else {}
    except (TypeError, ValueError):
        content = {}
    return {
        "id": str(item.id),
        "board_id": str(item.board_id),
        "type": item.type,
        "x": item.x,
        "y": item.y,
        "width": item.width,
        "height": item.height,
        "z": item.z,
        "content": content if isinstance(content, dict) else {},
        "color": item.color,
        "author_kind": item.author_kind,
        "created_by_id": str(item.created_by_id) if item.created_by_id else None,
        "created_by_name": item.created_by_name,
        "approval_status": item.approval_status,
        "approval_requested_by_name": item.approval_requested_by_name,
        "approval_decided_by_name": item.approval_decided_by_name,
        "approval_decided_at": item.approval_decided_at.isoformat() if item.approval_decided_at else None,
        "approval_note": item.approval_note,
    }


# Public alias — routers build their response with the same helper the
# broadcast uses, so the two never drift.
item_payload = _item_payload


async def board_read_items(db: AsyncSession, board_id: uuid.UUID, viewer_id: uuid.UUID | None) -> list[dict]:
    """The board GET's item list: each card's core payload merged with its
    reaction / comment meta for ``viewer_id``."""
    items = await list_items(db, board_id)
    meta = await item_meta(db, [item.id for item in items], viewer_id)
    return [{**_item_payload(item), **meta[item.id]} for item in items]


async def item_read(db: AsyncSession, item: BoardItem, viewer_id: uuid.UUID | None) -> dict:
    """One card's core payload merged with its meta — for create / update / get
    responses (the realtime events stay meta-free; see BoardItemRead)."""
    meta = await item_meta(db, [item.id], viewer_id)
    return {**_item_payload(item), **meta[item.id]}


# ---- Reactions + comments -------------------------------------------


async def item_meta(db: AsyncSession, item_ids: list[uuid.UUID], viewer_id: uuid.UUID | None) -> dict[uuid.UUID, dict]:
    """Per-item reaction counts, the viewer's own reactions, and comment
    counts — three grouped queries, not one per item (mirrors
    get_project_board's aggregate pattern). Every requested id gets an entry."""
    meta: dict[uuid.UUID, dict] = {iid: {"reactions": {}, "my_reactions": [], "comment_count": 0} for iid in item_ids}
    if not item_ids:
        return meta

    reactions = await db.execute(
        select(BoardItemReaction.item_id, BoardItemReaction.kind, func.count())
        .where(BoardItemReaction.item_id.in_(item_ids))
        .group_by(BoardItemReaction.item_id, BoardItemReaction.kind)
    )
    for iid, kind, n in reactions.all():
        meta[iid]["reactions"][kind] = int(n)

    if viewer_id is not None:
        mine = await db.execute(
            select(BoardItemReaction.item_id, BoardItemReaction.kind).where(
                BoardItemReaction.item_id.in_(item_ids), BoardItemReaction.user_id == viewer_id
            )
        )
        for iid, kind in mine.all():
            meta[iid]["my_reactions"].append(kind)

    comments = await db.execute(
        select(BoardItemComment.item_id, func.count())
        .where(BoardItemComment.item_id.in_(item_ids))
        .group_by(BoardItemComment.item_id)
    )
    for iid, n in comments.all():
        meta[iid]["comment_count"] = int(n)

    return meta


async def _reaction_counts(db: AsyncSession, item_id: uuid.UUID) -> dict[str, int]:
    result = await db.execute(
        select(BoardItemReaction.kind, func.count())
        .where(BoardItemReaction.item_id == item_id)
        .group_by(BoardItemReaction.kind)
    )
    return {kind: int(n) for kind, n in result.all()}


async def toggle_reaction(
    db: AsyncSession, item: BoardItem, project: Project, *, user: User, kind: str
) -> tuple[bool, dict[str, int]]:
    """Add the (item, user, kind) reaction, or remove it if it's already
    there. Returns (added, {kind: count}) and broadcasts the new counts."""
    if kind not in REACTION_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown reaction")

    existing = await db.execute(
        select(BoardItemReaction).where(
            BoardItemReaction.item_id == item.id,
            BoardItemReaction.user_id == user.id,
            BoardItemReaction.kind == kind,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        db.add(BoardItemReaction(item_id=item.id, user_id=user.id, kind=kind))
        added = True
    else:
        await db.delete(row)
        added = False
    await db.commit()

    counts = await _reaction_counts(db, item.id)
    await _broadcast(
        db,
        project,
        item.board_id,
        realtime.EVENT_BOARD_REACTION,
        {"item_id": str(item.id), "user_id": str(user.id), "kind": kind, "added": added, "reactions": counts},
    )
    return added, counts


async def list_comments(db: AsyncSession, item_id: uuid.UUID) -> list[BoardItemComment]:
    result = await db.execute(
        select(BoardItemComment).where(BoardItemComment.item_id == item_id).order_by(BoardItemComment.created_at)
    )
    return list(result.scalars().all())


async def get_comment_or_404(db: AsyncSession, item_id: uuid.UUID, comment_id: uuid.UUID) -> BoardItemComment:
    result = await db.execute(
        select(BoardItemComment).where(BoardItemComment.id == comment_id, BoardItemComment.item_id == item_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    return comment


async def add_comment(
    db: AsyncSession, item: BoardItem, project: Project, *, author: User, author_kind: str, body: str
) -> BoardItemComment:
    comment = BoardItemComment(
        item_id=item.id,
        author_kind=author_kind,
        author_user_id=author.id,
        author_name=author.full_name,
        body=body.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_COMMENT_CREATED, comment_payload(comment))

    # Tell the card's author someone commented — but only when they're an
    # agency member (portal contacts have no notification bell yet) and not the
    # commenter themselves.
    if item.created_by_id and item.created_by_id != author.id:
        is_member = await db.execute(
            select(AgencyMember.id).where(
                AgencyMember.agency_id == project.agency_id, AgencyMember.user_id == item.created_by_id
            )
        )
        if is_member.scalar_one_or_none() is not None:
            await notifications_service.notify(
                db,
                user_id=item.created_by_id,
                category=CATEGORY_PROJECTS,
                event_type=EVENT_CANVAS_COMMENT,
                title=f"{author.full_name} commented on your card in {project.name}",
                body=body.strip()[:280],
                link=f"/projects/{project.id}/canvas",
                agency_id=project.agency_id,
                actor=author,
            )
    return comment


async def delete_comment(
    db: AsyncSession, comment: BoardItemComment, project: Project, *, requested_by: User, requester_role: str
) -> None:
    is_author = comment.author_user_id == requested_by.id
    if not is_author and requester_role not in (ROLE_OWNER, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own comments")

    comment_id, item_id = comment.id, comment.item_id
    board = await db.execute(select(BoardItem.board_id).where(BoardItem.id == item_id))
    board_id = board.scalar_one_or_none()
    await db.delete(comment)
    await db.commit()
    if board_id is not None:
        await _broadcast(
            db,
            project,
            board_id,
            realtime.EVENT_BOARD_COMMENT_DELETED,
            {"id": str(comment_id), "item_id": str(item_id)},
        )


def comment_payload(comment: BoardItemComment) -> dict:
    return {
        "id": str(comment.id),
        "item_id": str(comment.item_id),
        "author_kind": comment.author_kind,
        "author_user_id": str(comment.author_user_id) if comment.author_user_id else None,
        "author_name": comment.author_name,
        "body": comment.body,
        "created_at": comment.created_at.isoformat(),
    }


__all__ = [
    "ITEM_IMAGE",
    "ITEM_NOTE",
    "add_comment",
    "comment_payload",
    "create_item",
    "decide_approval",
    "delete_comment",
    "delete_item",
    "get_comment_or_404",
    "get_item_or_404",
    "get_or_create_board",
    "item_meta",
    "item_payload",
    "list_comments",
    "list_items",
    "request_approval",
    "save_board_image",
    "toggle_reaction",
    "update_item",
    "withdraw_approval",
]
