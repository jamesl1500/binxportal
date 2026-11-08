"""Collaboration-canvas service. Every mutation commits, then fans the change
out over the messaging websocket infra (``realtime.manager``) to the project's
agency members and the client's portal contacts — the HTTP response and the
live event carry the same data. Nothing imports this module except the
routers (incl. ``projects/router.py``, which calls :func:`sync_task_change`
after Kanban edits), so it can import ``projects``/``client_portal``/
``messaging`` services freely.

Milanote-style structure on top of the original freeform board:

- **Nested boards** — ``ProjectBoard`` is a tree; a ``board`` card on a parent
  opens its child. Each project has one root (``parent_id`` null).
- **Columns** — a ``column`` card holds an ordered stack of other cards
  (``BoardItem.parent_id`` + ``position``).
- **Lines** — a ``line`` card connects two cards (or free points).
- **To-do cards** — rows are real ``ProjectTask``s (``board_item_id``); a row
  is "done" when its task sits in the project's last Kanban list, which is
  the same rule the dashboard and portal progress use.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_OWNER, AgencyMember
from binx_api.modules.boards import link_preview
from binx_api.modules.boards.models import (
    AGENCY_ONLY_TYPES,
    ALLOWED_BOARD_IMAGE_MIME_TYPES,
    APPROVABLE_TYPES,
    APPROVAL_APPROVED,
    APPROVAL_PENDING,
    AUTHOR_AGENCY,
    AUTHOR_CLIENT,
    COLUMN_CHILD_TYPES,
    DEFAULT_COLUMN_WIDTH,
    DEFAULT_NOTE_HEIGHT,
    DEFAULT_NOTE_WIDTH,
    DEFAULT_PIN_HEIGHT,
    DEFAULT_PIN_WIDTH,
    ITEM_BOARD,
    ITEM_COLUMN,
    ITEM_FILE,
    ITEM_IMAGE,
    ITEM_LINE,
    ITEM_LINK,
    ITEM_NOTE,
    ITEM_PIN,
    ITEM_TODO,
    LINE_ARROWS,
    MAX_BOARD_DEPTH,
    REACTION_KINDS,
    BoardItem,
    BoardItemComment,
    BoardItemReaction,
    BoardItemVersion,
    ProjectBoard,
)
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.messaging import realtime
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS, EVENT_CANVAS_APPROVAL, EVENT_CANVAS_COMMENT
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import Project, ProjectFile, ProjectTask, ProjectTaskList
from binx_api.modules.users.models import User

# Keep a runaway canvas (or a script) from filling the table — per board.
MAX_ITEMS_PER_BOARD = 500
# A to-do card's rows are tasks; keep one card from swallowing a project.
MAX_TASKS_PER_TODO = 100
# Clamp geometry to sane bounds server-side (the client also clamps).
_MIN_SIZE = 60.0
_MAX_SIZE = 4000.0
_MAX_COORD = 100_000.0
_MAX_TITLE = 120
_MAX_TODO_TITLE = 200


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _loads(raw: str | None) -> dict:
    try:
        value = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


# ---- Boards (the tree) -------------------------------------------------


async def get_or_create_board(db: AsyncSession, project: Project) -> ProjectBoard:
    """The project's root board, lazily created."""
    query = select(ProjectBoard).where(ProjectBoard.project_id == project.id, ProjectBoard.parent_id.is_(None))
    board = (await db.execute(query)).scalar_one_or_none()
    if board is not None:
        return board

    board = ProjectBoard(project_id=project.id)
    db.add(board)
    try:
        await db.commit()
    except IntegrityError:
        # Two first-visits raced — the loser reads the winner's row.
        await db.rollback()
        return (await db.execute(query)).scalar_one()
    await db.refresh(board)
    return board


async def resolve_board(db: AsyncSession, project: Project, board_id: uuid.UUID | None) -> ProjectBoard:
    """``board_id`` if it's one of this project's boards, else 404; the root
    board when ``board_id`` is None."""
    if board_id is None:
        return await get_or_create_board(db, project)
    board = (
        await db.execute(select(ProjectBoard).where(ProjectBoard.id == board_id, ProjectBoard.project_id == project.id))
    ).scalar_one_or_none()
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return board


async def board_path(db: AsyncSession, board: ProjectBoard) -> list[dict]:
    """Root → ``board`` breadcrumb trail: ``[{"id", "title"}]`` (root title null)."""
    trail = [board]
    seen = {board.id}
    current = board
    while current.parent_id is not None and len(trail) <= MAX_BOARD_DEPTH:
        parent = await db.get(ProjectBoard, current.parent_id)
        if parent is None or parent.id in seen:
            break
        trail.append(parent)
        seen.add(parent.id)
        current = parent
    return [{"id": str(b.id), "title": b.title} for b in reversed(trail)]


async def _board_descendant_ids(db: AsyncSession, project_id: uuid.UUID, root_id: uuid.UUID) -> set[uuid.UUID]:
    rows = (
        await db.execute(select(ProjectBoard.id, ProjectBoard.parent_id).where(ProjectBoard.project_id == project_id))
    ).all()
    children: dict[uuid.UUID, list[uuid.UUID]] = {}
    for bid, pid in rows:
        if pid is not None:
            children.setdefault(pid, []).append(bid)
    out: set[uuid.UUID] = set()
    stack = [root_id]
    while stack:
        node = stack.pop()
        if node in out:
            continue
        out.add(node)
        stack.extend(children.get(node, []))
    return out


def canvas_link(project: Project, board: ProjectBoard | None, *, portal: bool = False) -> str:
    base = f"/portal/projects/{project.id}/canvas" if portal else f"/projects/{project.id}/canvas"
    if board is not None and board.parent_id is not None:
        return f"{base}?board={board.id}"
    return base


# ---- Item lookup -------------------------------------------------------


async def list_items(db: AsyncSession, board_id: uuid.UUID) -> list[BoardItem]:
    result = await db.execute(select(BoardItem).where(BoardItem.board_id == board_id).order_by(BoardItem.z))
    return list(result.scalars().all())


async def get_item_or_404(db: AsyncSession, board_id: uuid.UUID, item_id: uuid.UUID) -> BoardItem:
    result = await db.execute(select(BoardItem).where(BoardItem.id == item_id, BoardItem.board_id == board_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return item


async def get_project_item_or_404(db: AsyncSession, project: Project, item_id: uuid.UUID) -> BoardItem:
    """A card on *any* of the project's boards (root or nested)."""
    result = await db.execute(
        select(BoardItem)
        .join(ProjectBoard, ProjectBoard.id == BoardItem.board_id)
        .where(BoardItem.id == item_id, ProjectBoard.project_id == project.id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return item


async def _next_z(db: AsyncSession, board_id: uuid.UUID) -> int:
    result = await db.execute(select(func.coalesce(func.max(BoardItem.z), 0)).where(BoardItem.board_id == board_id))
    return int(result.scalar_one()) + 1


async def _column_children(
    db: AsyncSession, column_id: uuid.UUID, *, exclude: uuid.UUID | None = None
) -> list[BoardItem]:
    query = select(BoardItem).where(BoardItem.parent_id == column_id)
    if exclude is not None:
        query = query.where(BoardItem.id != exclude)
    result = await db.execute(query.order_by(BoardItem.position, BoardItem.z))
    return list(result.scalars().all())


# ---- Realtime ----------------------------------------------------------


async def _member_and_contact_ids(db: AsyncSession, project: Project) -> tuple[list[uuid.UUID], list[uuid.UUID]]:
    members = await db.execute(select(AgencyMember.user_id).where(AgencyMember.agency_id == project.agency_id))
    contacts = await db.execute(select(ClientContact.user_id).where(ClientContact.client_id == project.client_id))
    return list(members.scalars().all()), list(contacts.scalars().all())


async def _recipient_user_ids(db: AsyncSession, project: Project) -> list[uuid.UUID]:
    """Everyone who might have the canvas open: the agency's members and the
    project client's portal contacts. Best-effort — send_to_users only touches
    users with a live socket."""
    members, contacts = await _member_and_contact_ids(db, project)
    return list({*members, *contacts})


async def _broadcast(db: AsyncSession, project: Project, board_id: uuid.UUID, event_type: str, data: dict) -> None:
    recipients = await _recipient_user_ids(db, project)
    await realtime.manager.send_to_users(recipients, {"type": event_type, "board_id": str(board_id), "data": data})


async def _broadcast_items(db: AsyncSession, project: Project, event_type: str, items: list[BoardItem]) -> None:
    for item in items:
        await _broadcast(db, project, item.board_id, event_type, _item_payload(item))


# ---- Content normalisation --------------------------------------------


def _title(value: Any, limit: int = _MAX_TITLE) -> str:
    return " ".join(str(value or "").split())[:limit]


def _line_geometry(content: dict) -> tuple[float, float, float, float]:
    """A line's bounding box from its endpoint coordinates (the frontend keeps
    x1..y2 current even for attached ends, so the box is always meaningful)."""
    x1, y1, x2, y2 = (float(content.get(k, 0.0)) for k in ("x1", "y1", "x2", "y2"))
    left, top = min(x1, x2), min(y1, y2)
    return left, top, max(abs(x2 - x1), 1.0), max(abs(y2 - y1), 1.0)


async def _normalize_line(db: AsyncSession, board_id: uuid.UUID, raw: dict, existing: dict | None = None) -> dict:
    base = {**(existing or {}), **raw}
    out: dict[str, Any] = {}
    for key in ("x1", "y1", "x2", "y2"):
        try:
            out[key] = _clamp(float(base.get(key, 0.0)), -_MAX_COORD, _MAX_COORD)
        except (TypeError, ValueError):
            out[key] = 0.0
    arrow = base.get("arrow", "end")
    out["arrow"] = arrow if arrow in LINE_ARROWS else "end"
    for end in ("from", "to"):
        ref = base.get(end)
        if not ref:
            out[end] = None
            continue
        try:
            ref_id = uuid.UUID(str(ref))
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A line can only connect cards") from exc
        target = (
            await db.execute(select(BoardItem.type).where(BoardItem.id == ref_id, BoardItem.board_id == board_id))
        ).scalar_one_or_none()
        if target is None or target == ITEM_LINE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A line can only connect cards on the same board")
        out[end] = str(ref_id)
    return out


# ---- Create / update / delete -----------------------------------------


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
    parent_id: uuid.UUID | None = None,
    position: int | None = None,
) -> BoardItem:
    if author_kind == AUTHOR_CLIENT and type_ in AGENCY_ONLY_TYPES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only your agency team can add to-do lists.")

    count = await db.execute(select(func.count()).select_from(BoardItem).where(BoardItem.board_id == board.id))
    if int(count.scalar_one()) >= MAX_ITEMS_PER_BOARD:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This board is full ({MAX_ITEMS_PER_BOARD} cards).")

    stored: dict[str, Any]
    if type_ == ITEM_NOTE:
        stored = {"text": str(content.get("text", ""))}
    elif type_ == ITEM_TODO:
        stored = {"title": _title(content.get("title"), _MAX_TODO_TITLE)}
    elif type_ == ITEM_COLUMN:
        stored = {"title": _title(content.get("title"))}
    elif type_ == ITEM_BOARD:
        stored = {"title": _title(content.get("title")) or "Untitled board"}
    elif type_ == ITEM_LINK:
        url = link_preview.normalize_url(str(content.get("url", "")))
        stored = await link_preview.fetch_preview(url)
    elif type_ == ITEM_LINE:
        stored = await _normalize_line(db, board.id, content)
    elif type_ == ITEM_PIN:
        stored = {}
    else:
        # image / file — the routers build this from the stored upload.
        stored = dict(content)

    # Geometry. A pin is a fixed marker; a line's box comes from its ends.
    if type_ == ITEM_PIN:
        gx, gy, gw, gh = x, y, DEFAULT_PIN_WIDTH, DEFAULT_PIN_HEIGHT
    elif type_ == ITEM_LINE:
        gx, gy, gw, gh = _line_geometry(stored)
    else:
        default_w = DEFAULT_COLUMN_WIDTH if type_ == ITEM_COLUMN else DEFAULT_NOTE_WIDTH
        gx, gy = x, y
        gw = _clamp(width or default_w, _MIN_SIZE, _MAX_SIZE)
        gh = _clamp(height or DEFAULT_NOTE_HEIGHT, _MIN_SIZE, _MAX_SIZE)

    column: BoardItem | None = None
    if parent_id is not None:
        column = await _require_column(db, board.id, parent_id, type_)

    child_board: ProjectBoard | None = None
    if type_ == ITEM_BOARD:
        depth = len(await board_path(db, board))
        if depth >= MAX_BOARD_DEPTH:
            raise HTTPException(status.HTTP_409_CONFLICT, "Boards can't be nested any deeper.")
        child_board = ProjectBoard(project_id=project.id, parent_id=board.id, title=stored["title"])
        db.add(child_board)
        await db.flush()
        stored["board_id"] = str(child_board.id)

    item = BoardItem(
        board_id=board.id,
        type=type_,
        x=_clamp(gx, -_MAX_COORD, _MAX_COORD),
        y=_clamp(gy, -_MAX_COORD, _MAX_COORD),
        width=gw,
        height=gh,
        z=await _next_z(db, board.id),
        content=json.dumps(stored),
        color=color,
        author_kind=author_kind,
        created_by_id=actor.id if actor else None,
        created_by_name=actor.full_name if actor else "Someone",
    )
    db.add(item)
    await db.flush()

    reindexed: list[BoardItem] = []
    if column is not None:
        reindexed = await _insert_into_column(db, item, column, position)

    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, board.id, realtime.EVENT_BOARD_ITEM_CREATED, _item_payload(item))
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, [s for s in reindexed if s.id != item.id])
    return item


async def _require_column(db: AsyncSession, board_id: uuid.UUID, column_id: uuid.UUID, child_type: str) -> BoardItem:
    if child_type not in COLUMN_CHILD_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That kind of card can't go in a column.")
    column = (
        await db.execute(select(BoardItem).where(BoardItem.id == column_id, BoardItem.board_id == board_id))
    ).scalar_one_or_none()
    if column is None or column.type != ITEM_COLUMN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cards can only be dropped into a column on this board.")
    return column


async def _insert_into_column(
    db: AsyncSession, item: BoardItem, column: BoardItem, position: int | None
) -> list[BoardItem]:
    """Place ``item`` into ``column`` at ``position`` (end when None) and
    renumber the stack. Returns every child whose position changed."""
    siblings = await _column_children(db, column.id, exclude=item.id)
    index = len(siblings) if position is None else max(0, min(position, len(siblings)))
    siblings.insert(index, item)
    item.parent_id = column.id
    changed = []
    for i, sibling in enumerate(siblings):
        if sibling.position != i or sibling.id == item.id:
            sibling.position = i
            changed.append(sibling)
    return changed


async def _close_column_gap(db: AsyncSession, column_id: uuid.UUID, *, exclude: uuid.UUID) -> list[BoardItem]:
    changed = []
    for i, sibling in enumerate(await _column_children(db, column_id, exclude=exclude)):
        if sibling.position != i:
            sibling.position = i
            changed.append(sibling)
    return changed


def _clear_approval(item: BoardItem) -> None:
    item.approval_status = None
    item.approval_requested_by_id = None
    item.approval_requested_by_name = None
    item.approval_decided_by_name = None
    item.approval_decided_at = None
    item.approval_note = None


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
    parent_id: uuid.UUID | None = None,
    clear_parent: bool = False,
    position: int | None = None,
    board_id: uuid.UUID | None = None,
) -> BoardItem:
    if board_id is not None and board_id != item.board_id:
        return await move_item_to_board(db, item, project, target_board_id=board_id, x=x, y=y)

    if x is not None:
        item.x = _clamp(x, -_MAX_COORD, _MAX_COORD)
    if y is not None:
        item.y = _clamp(y, -_MAX_COORD, _MAX_COORD)
    if width is not None and item.type not in (ITEM_PIN, ITEM_LINE):
        item.width = _clamp(width, _MIN_SIZE, _MAX_SIZE)
    if height is not None and item.type not in (ITEM_PIN, ITEM_LINE):
        item.height = _clamp(height, _MIN_SIZE, _MAX_SIZE)
    if z is not None:
        item.z = z

    substance_changed = False
    if content is not None:
        current = _loads(item.content)
        next_content: dict[str, Any] | None = None
        if item.type == ITEM_NOTE:
            next_content = {"text": str(content.get("text", ""))}
        elif item.type == ITEM_TODO:
            next_content = {"title": _title(content.get("title"), _MAX_TODO_TITLE)}
        elif item.type == ITEM_COLUMN:
            next_content = {"title": _title(content.get("title"))}
        elif item.type == ITEM_BOARD:
            title = _title(content.get("title")) or "Untitled board"
            next_content = {**current, "title": title}
            child_id = current.get("board_id")
            if child_id:
                child = await db.get(ProjectBoard, uuid.UUID(child_id))
                if child is not None:
                    child.title = title
        elif item.type == ITEM_LINK:
            raw_url = content.get("url")
            if raw_url is not None and link_preview.normalize_url(str(raw_url)) != current.get("url"):
                next_content = await link_preview.fetch_preview(link_preview.normalize_url(str(raw_url)))
            elif "title" in content:
                next_content = {**current, "title": _title(content.get("title"), 300) or current.get("title")}
        elif item.type == ITEM_LINE:
            next_content = await _normalize_line(db, item.board_id, content, current)
            item.x, item.y, item.width, item.height = _line_geometry(next_content)
        # image / file / pin content is fixed.
        if next_content is not None:
            serialized = json.dumps(next_content)
            if item.type in APPROVABLE_TYPES and serialized != item.content:
                substance_changed = True
            item.content = serialized

    if clear_color:
        substance_changed = substance_changed or item.color is not None
        item.color = None
    elif color is not None:
        substance_changed = substance_changed or color != item.color
        item.color = color

    # A card's approval is pinned to a specific BoardItemVersion snapshot — an
    # edit to its substance after that snapshot was taken means the live card
    # no longer matches whatever was requested or decided, so the decision no
    # longer applies. The snapshot itself (and any approved_version_number
    # pointing at one) is untouched, so approval history stays intact; the
    # agency just has to request approval again for the new content.
    if substance_changed and item.approval_status is not None:
        _clear_approval(item)

    # Column membership.
    reindexed: list[BoardItem] = []
    if clear_parent and item.parent_id is not None:
        old_parent = item.parent_id
        item.parent_id = None
        item.position = 0
        reindexed = await _close_column_gap(db, old_parent, exclude=item.id)
    elif parent_id is not None:
        column = await _require_column(db, item.board_id, parent_id, item.type)
        old_parent = item.parent_id
        reindexed = await _insert_into_column(db, item, column, position)
        if old_parent is not None and old_parent != column.id:
            reindexed += await _close_column_gap(db, old_parent, exclude=item.id)
    elif position is not None and item.parent_id is not None:
        column = await db.get(BoardItem, item.parent_id)
        if column is not None:
            reindexed = await _insert_into_column(db, item, column, position)

    await db.commit()
    await db.refresh(item)
    await _broadcast(db, project, item.board_id, realtime.EVENT_BOARD_ITEM_UPDATED, _item_payload(item))
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, [s for s in reindexed if s.id != item.id])
    return item


async def _lines_touching(db: AsyncSession, board_id: uuid.UUID, item_ids: set[uuid.UUID]) -> list[BoardItem]:
    if not item_ids:
        return []
    lines = (
        (await db.execute(select(BoardItem).where(BoardItem.board_id == board_id, BoardItem.type == ITEM_LINE)))
        .scalars()
        .all()
    )
    wanted = {str(i) for i in item_ids}
    out = []
    for line in lines:
        content = _loads(line.content)
        if content.get("from") in wanted or content.get("to") in wanted:
            out.append(line)
    return out


async def move_item_to_board(
    db: AsyncSession,
    item: BoardItem,
    project: Project,
    *,
    target_board_id: uuid.UUID,
    x: float | None = None,
    y: float | None = None,
) -> BoardItem:
    """Move a card (and, for a column, its stack) onto another of the
    project's boards — what dropping a card onto a board card does. Lines
    attached to it stay behind and are removed (they can't span boards)."""
    if item.type in (ITEM_LINE, ITEM_PIN):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lines and comment pins stay on their board.")
    target = await resolve_board(db, project, target_board_id)
    if item.type == ITEM_BOARD:
        child_id = _loads(item.content).get("board_id")
        if child_id:
            forbidden = await _board_descendant_ids(db, project.id, uuid.UUID(child_id))
            if target.id in forbidden:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "A board can't be moved inside itself.")
        depth = len(await board_path(db, target))
        if depth >= MAX_BOARD_DEPTH:
            raise HTTPException(status.HTTP_409_CONFLICT, "Boards can't be nested any deeper.")

    children = await _column_children(db, item.id) if item.type == ITEM_COLUMN else []
    moving = [item, *children]
    count_result = await db.execute(select(func.count()).select_from(BoardItem).where(BoardItem.board_id == target.id))
    target_count = int(count_result.scalar_one())
    if target_count + len(moving) > MAX_ITEMS_PER_BOARD:
        raise HTTPException(status.HTTP_409_CONFLICT, f"That board is full ({MAX_ITEMS_PER_BOARD} cards).")

    old_board_id = item.board_id
    old_parent = item.parent_id
    lines = await _lines_touching(db, old_board_id, {m.id for m in moving})

    # Drop it near the target's top-left, cascading so repeated moves don't
    # stack exactly on top of each other.
    offset = target_count % 10
    item.x = x if x is not None else 40.0 + offset * 24
    item.y = y if y is not None else 40.0 + offset * 24
    item.parent_id = None
    item.position = 0
    z = await _next_z(db, target.id)
    for i, moved in enumerate(moving):
        moved.board_id = target.id
        moved.z = z + i

    reindexed = await _close_column_gap(db, old_parent, exclude=item.id) if old_parent else []
    line_ids = [line.id for line in lines]
    for line in lines:
        await db.delete(line)
    await db.commit()

    for moved in moving:
        await db.refresh(moved)
    for gone_id in [*(m.id for m in moving), *line_ids]:
        await _broadcast(db, project, old_board_id, realtime.EVENT_BOARD_ITEM_DELETED, {"id": str(gone_id)})
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, reindexed)
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_CREATED, moving)
    return item


async def delete_item(db: AsyncSession, item: BoardItem, project: Project) -> None:
    """Delete a card. A column releases its stack back onto the board (laid
    out where the column stood) rather than taking it down with it; a board
    card takes its whole sub-board tree with it; lines attached to the card
    go too; a to-do card's tasks stay on the Kanban (FK SET NULL)."""
    item_id, board_id = item.id, item.board_id
    released: list[BoardItem] = []
    if item.type == ITEM_COLUMN:
        cursor_y = item.y + 56
        for child in await _column_children(db, item.id):
            child.parent_id = None
            child.position = 0
            child.x = item.x
            child.y = cursor_y
            cursor_y += child.height + 16
            released.append(child)

    reindexed = await _close_column_gap(db, item.parent_id, exclude=item.id) if item.parent_id else []
    lines = await _lines_touching(db, board_id, {item_id})
    line_ids = [line.id for line in lines]
    for line in lines:
        await db.delete(line)

    if item.type == ITEM_BOARD:
        child_id = _loads(item.content).get("board_id")
        if child_id:
            child = await db.get(ProjectBoard, uuid.UUID(child_id))
            if child is not None:
                await db.delete(child)

    await db.delete(item)
    await db.commit()
    for gone_id in [item_id, *line_ids]:
        await _broadcast(db, project, board_id, realtime.EVENT_BOARD_ITEM_DELETED, {"id": str(gone_id)})
    for changed in [*released, *reindexed]:
        await db.refresh(changed)
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, [*released, *reindexed])


# ---- Client approval ---------------------------------------------------


def _approval_targets(item: BoardItem, children: list[BoardItem]) -> list[BoardItem]:
    if item.type == ITEM_COLUMN:
        return [c for c in children if c.type in APPROVABLE_TYPES]
    if item.type not in APPROVABLE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This kind of card can't be sent for approval.")
    return [item]


def _request_one(db: AsyncSession, item: BoardItem, actor: User) -> None:
    next_number = (item.version_number or 0) + 1
    db.add(
        BoardItemVersion(
            item_id=item.id,
            version_number=next_number,
            content=item.content,
            color=item.color,
            status=APPROVAL_PENDING,
            requested_by_id=actor.id,
            requested_by_name=actor.full_name,
        )
    )
    item.version_number = next_number
    item.approval_status = APPROVAL_PENDING
    item.approval_requested_by_id = actor.id
    item.approval_requested_by_name = actor.full_name
    item.approval_decided_by_name = None
    item.approval_decided_at = None
    item.approval_note = None


async def request_approval(db: AsyncSession, item: BoardItem, project: Project, *, actor: User) -> BoardItem:
    """An agency member asks the client to review this card. Always resets to
    ``pending``, even if it was already decided — that's how a re-request
    after addressing feedback works. Snapshots the card's current content +
    colour into a new BoardItemVersion, so this exact request is pinned and
    stays answerable later even if the card changes again.

    On a **column**, sends every approvable card in its stack for review at
    once (skipping ones already pending) — Milanote-style "here's the whole
    moodboard, sign it off"."""
    children = await _column_children(db, item.id) if item.type == ITEM_COLUMN else []
    targets = [t for t in _approval_targets(item, children) if t is item or t.approval_status != APPROVAL_PENDING]
    if item.type == ITEM_COLUMN and not targets:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing in this column needs sending for review.")
    for target in targets:
        _request_one(db, target, actor)
    await db.commit()
    for target in targets:
        await db.refresh(target)
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, targets)
    if item.type == ITEM_COLUMN:
        await db.refresh(item)
    return item


async def withdraw_approval(db: AsyncSession, item: BoardItem, project: Project) -> BoardItem:
    """Clears the card's approval state entirely, whatever it currently is —
    an agency member changed their mind about asking, or wants to drop an
    old decision and start clean. On a column, withdraws every *pending*
    request in its stack."""
    if item.type == ITEM_COLUMN:
        targets = [c for c in await _column_children(db, item.id) if c.approval_status == APPROVAL_PENDING]
        if not targets:
            raise HTTPException(status.HTTP_409_CONFLICT, "Nothing in this column is awaiting review.")
    else:
        if item.approval_status is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This card has no approval request.")
        targets = [item]
    for target in targets:
        _clear_approval(target)
    await db.commit()
    for target in targets:
        await db.refresh(target)
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, targets)
    if item.type == ITEM_COLUMN:
        await db.refresh(item)
    return item


async def decide_approval(
    db: AsyncSession, item: BoardItem, project: Project, *, decider: User, decision: str, note: str | None
) -> BoardItem:
    """A client-portal contact approves or asks for changes on a card that's
    awaiting review — or, on a column, on every pending card in its stack in
    one go. Notifies each agency member who requested one of them, once."""
    if item.type == ITEM_COLUMN:
        targets = [c for c in await _column_children(db, item.id) if c.approval_status == APPROVAL_PENDING]
        if not targets:
            raise HTTPException(status.HTTP_409_CONFLICT, "Nothing in this column is awaiting your review.")
    else:
        if item.approval_status != APPROVAL_PENDING:
            raise HTTPException(status.HTTP_409_CONFLICT, "This card isn't awaiting approval.")
        targets = [item]

    decided_at = datetime.now(UTC)
    decided_note = note.strip() if note and note.strip() else None

    for target in targets:
        if target.version_number is not None:
            version = (
                await db.execute(
                    select(BoardItemVersion).where(
                        BoardItemVersion.item_id == target.id, BoardItemVersion.version_number == target.version_number
                    )
                )
            ).scalar_one_or_none()
            if version is not None:
                version.status = decision
                version.decided_by_name = decider.full_name
                version.decided_at = decided_at
                version.note = decided_note
        target.approval_status = decision
        target.approval_decided_by_name = decider.full_name
        target.approval_decided_at = decided_at
        target.approval_note = decided_note
        if decision == APPROVAL_APPROVED:
            target.approved_version_number = target.version_number
    await db.commit()
    for target in targets:
        await db.refresh(target)
    await _broadcast_items(db, project, realtime.EVENT_BOARD_ITEM_UPDATED, targets)
    if item.type == ITEM_COLUMN:
        await db.refresh(item)

    board = await db.get(ProjectBoard, item.board_id)
    verb = "approved" if decision == APPROVAL_APPROVED else "requested changes on"
    by_requester: dict[uuid.UUID, int] = {}
    for target in targets:
        if target.approval_requested_by_id and target.approval_requested_by_id != decider.id:
            by_requester[target.approval_requested_by_id] = by_requester.get(target.approval_requested_by_id, 0) + 1
    for requester_id, n in by_requester.items():
        is_member = await db.execute(
            select(AgencyMember.id).where(
                AgencyMember.agency_id == project.agency_id, AgencyMember.user_id == requester_id
            )
        )
        if is_member.scalar_one_or_none() is None:
            continue
        if item.type == ITEM_COLUMN:
            column_title = _loads(item.content).get("title") or "a column"
            what = f"{n} card{'s' if n != 1 else ''} in “{column_title}”"
        else:
            what = "your card"
        await notifications_service.notify(
            db,
            user_id=requester_id,
            category=CATEGORY_PROJECTS,
            event_type=EVENT_CANVAS_APPROVAL,
            title=f"{decider.full_name} {verb} {what} in {project.name}",
            body=decided_note[:280] if decided_note else None,
            link=canvas_link(project, board),
            agency_id=project.agency_id,
            actor=decider,
        )
    return item


async def list_versions(db: AsyncSession, item_id: uuid.UUID) -> list[BoardItemVersion]:
    """A card's full approval history, newest first — each row an immutable
    snapshot of what was asked for review and how it was decided."""
    result = await db.execute(
        select(BoardItemVersion)
        .where(BoardItemVersion.item_id == item_id)
        .order_by(BoardItemVersion.version_number.desc())
    )
    return list(result.scalars().all())


def version_payload(version: BoardItemVersion) -> dict:
    return {
        "id": str(version.id),
        "item_id": str(version.item_id),
        "version_number": version.version_number,
        "content": _loads(version.content),
        "color": version.color,
        "status": version.status,
        "requested_by_name": version.requested_by_name,
        "decided_by_name": version.decided_by_name,
        "decided_at": version.decided_at.isoformat() if version.decided_at else None,
        "note": version.note,
        "created_at": version.created_at.isoformat(),
    }


# ---- Uploads -----------------------------------------------------------


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


async def save_board_file(
    db: AsyncSession, project: Project, *, uploaded_by: User, file_name: str, content: bytes, mime_type: str
) -> ProjectFile:
    """Any file for a ``file`` card (PDF, doc, zip…) — same storage and size
    limit as the Files tab, which it also appears on."""
    return await projects_service.save_project_file(
        db, project, uploaded_by=uploaded_by, file_name=file_name, content=content, mime_type=mime_type
    )


def file_card_content(stored: ProjectFile) -> dict:
    return {
        "file_id": str(stored.id),
        "file_name": stored.file_name,
        "mime_type": stored.mime_type,
        "size": stored.size,
    }


# ---- Payloads ----------------------------------------------------------


def _item_payload(item: BoardItem) -> dict:
    """The wire shape shared by the HTTP response and the realtime event."""
    return {
        "id": str(item.id),
        "board_id": str(item.board_id),
        "type": item.type,
        "parent_id": str(item.parent_id) if item.parent_id else None,
        "position": item.position or 0,
        "x": item.x,
        "y": item.y,
        "width": item.width,
        "height": item.height,
        "z": item.z,
        "content": _loads(item.content),
        "color": item.color,
        "author_kind": item.author_kind,
        "created_by_id": str(item.created_by_id) if item.created_by_id else None,
        "created_by_name": item.created_by_name,
        "approval_status": item.approval_status,
        "approval_requested_by_name": item.approval_requested_by_name,
        "approval_decided_by_name": item.approval_decided_by_name,
        "approval_decided_at": item.approval_decided_at.isoformat() if item.approval_decided_at else None,
        "approval_note": item.approval_note,
        "version_number": item.version_number,
        "approved_version_number": item.approved_version_number,
    }


# Public alias — routers build their response with the same helper the
# broadcast uses, so the two never drift.
item_payload = _item_payload


async def board_read(
    db: AsyncSession, project: Project, board: ProjectBoard, viewer_id: uuid.UUID | None, *, include_assignee: bool
) -> dict:
    """Everything the canvas page needs for one board: its breadcrumb trail,
    every card (with reaction/comment meta, plus sub-board counts on board
    cards) and the tasks on its to-do cards."""
    return {
        "board_id": str(board.id),
        "parent_id": str(board.parent_id) if board.parent_id else None,
        "title": board.title,
        "path": await board_path(db, board),
        "items": await board_read_items(db, board.id, viewer_id, project_id=project.id),
        "tasks": await list_board_tasks(db, project, board.id, include_assignee=include_assignee),
    }


async def board_read_items(
    db: AsyncSession, board_id: uuid.UUID, viewer_id: uuid.UUID | None, *, project_id: uuid.UUID | None = None
) -> list[dict]:
    """The board GET's item list: each card's core payload merged with its
    reaction / comment meta for ``viewer_id``, and — for board cards — how
    many cards the sub-board holds and how many (anywhere beneath it) await
    the client's review."""
    items = await list_items(db, board_id)
    meta = await item_meta(db, [item.id for item in items], viewer_id)

    board_cards = {item.id: _loads(item.content).get("board_id") for item in items if item.type == ITEM_BOARD}
    if board_cards and project_id is not None:
        counts = await _sub_board_counts(db, project_id)
        for iid, child in board_cards.items():
            if child:
                child_count, pending = counts(uuid.UUID(child))
                meta[iid]["child_count"] = child_count
                meta[iid]["pending_count"] = pending
    return [{**_item_payload(item), **meta[item.id]} for item in items]


async def _sub_board_counts(db: AsyncSession, project_id: uuid.UUID):
    boards = (
        await db.execute(select(ProjectBoard.id, ProjectBoard.parent_id).where(ProjectBoard.project_id == project_id))
    ).all()
    children: dict[uuid.UUID, list[uuid.UUID]] = {}
    for bid, pid in boards:
        if pid is not None:
            children.setdefault(pid, []).append(bid)
    board_ids = [bid for bid, _ in boards]
    direct = dict(
        (
            await db.execute(
                select(BoardItem.board_id, func.count())
                .where(BoardItem.board_id.in_(board_ids), BoardItem.type != ITEM_LINE, BoardItem.parent_id.is_(None))
                .group_by(BoardItem.board_id)
            )
        ).all()
    )
    pending = dict(
        (
            await db.execute(
                select(BoardItem.board_id, func.count())
                .where(BoardItem.board_id.in_(board_ids), BoardItem.approval_status == APPROVAL_PENDING)
                .group_by(BoardItem.board_id)
            )
        ).all()
    )

    def counts(board_id: uuid.UUID) -> tuple[int, int]:
        total_pending = 0
        stack, seen = [board_id], set()
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            total_pending += int(pending.get(node, 0))
            stack.extend(children.get(node, []))
        return int(direct.get(board_id, 0)), total_pending

    return counts


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
            board = await db.get(ProjectBoard, item.board_id)
            await notifications_service.notify(
                db,
                user_id=item.created_by_id,
                category=CATEGORY_PROJECTS,
                event_type=EVENT_CANVAS_COMMENT,
                title=f"{author.full_name} commented on your card in {project.name}",
                body=body.strip()[:280],
                link=canvas_link(project, board),
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


# ---- To-do cards (rows = ProjectTasks) --------------------------------


async def _first_and_last_list(db: AsyncSession, project_id: uuid.UUID) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    ids = (
        (
            await db.execute(
                select(ProjectTaskList.id)
                .where(ProjectTaskList.project_id == project_id)
                .order_by(ProjectTaskList.position)
            )
        )
        .scalars()
        .all()
    )
    return (ids[0], ids[-1]) if ids else (None, None)


async def _assignee_names(db: AsyncSession, tasks: list[ProjectTask]) -> dict[uuid.UUID, str]:
    ids = {t.assignee_id for t in tasks if t.assignee_id}
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
    return dict(rows.all())


def task_payload(
    task: ProjectTask, *, done_list_id: uuid.UUID | None, assignee_name: str | None, include_assignee: bool
) -> dict:
    return {
        "id": str(task.id),
        "item_id": str(task.board_item_id) if task.board_item_id else None,
        "title": task.title,
        "done": done_list_id is not None and task.list_id == done_list_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "position": task.todo_position or 0,
        "assignee_id": str(task.assignee_id) if include_assignee and task.assignee_id else None,
        "assignee_name": assignee_name if include_assignee else None,
    }


async def list_board_tasks(
    db: AsyncSession, project: Project, board_id: uuid.UUID, *, include_assignee: bool
) -> list[dict]:
    tasks = list(
        (
            await db.execute(
                select(ProjectTask)
                .join(BoardItem, BoardItem.id == ProjectTask.board_item_id)
                .where(BoardItem.board_id == board_id, ProjectTask.project_id == project.id)
                .order_by(ProjectTask.todo_position, ProjectTask.created_at)
            )
        )
        .scalars()
        .all()
    )
    _first, last = await _first_and_last_list(db, project.id)
    names = await _assignee_names(db, tasks) if include_assignee else {}
    return [
        task_payload(
            t,
            done_list_id=last,
            assignee_name=names.get(t.assignee_id) if t.assignee_id else None,
            include_assignee=include_assignee,
        )
        for t in tasks
    ]


async def _broadcast_task(db: AsyncSession, project: Project, board_id: uuid.UUID, task: ProjectTask) -> dict:
    """Send the row to the team with its assignee and to the client without
    (the portal never shows who internally owns a task)."""
    _first, last = await _first_and_last_list(db, project.id)
    name = (await _assignee_names(db, [task])).get(task.assignee_id) if task.assignee_id else None
    full = task_payload(task, done_list_id=last, assignee_name=name, include_assignee=True)
    trimmed = task_payload(task, done_list_id=last, assignee_name=None, include_assignee=False)
    members, contacts = await _member_and_contact_ids(db, project)
    event = {"type": realtime.EVENT_BOARD_TASK_UPSERTED, "board_id": str(board_id)}
    await realtime.manager.send_to_users(members, {**event, "data": full})
    only_contacts = [c for c in contacts if c not in set(members)]
    await realtime.manager.send_to_users(only_contacts, {**event, "data": trimmed})
    return full


async def _broadcast_task_removed(
    db: AsyncSession, project: Project, board_id: uuid.UUID, item_id: uuid.UUID, task_id: uuid.UUID
) -> None:
    await _broadcast(
        db, project, board_id, realtime.EVENT_BOARD_TASK_DELETED, {"id": str(task_id), "item_id": str(item_id)}
    )


def _require_todo(item: BoardItem) -> None:
    if item.type != ITEM_TODO:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That card isn't a to-do list.")


async def _todo_tasks(db: AsyncSession, item_id: uuid.UUID) -> list[ProjectTask]:
    return list(
        (
            await db.execute(
                select(ProjectTask)
                .where(ProjectTask.board_item_id == item_id)
                .order_by(ProjectTask.todo_position, ProjectTask.created_at)
            )
        )
        .scalars()
        .all()
    )


async def get_todo_task_or_404(db: AsyncSession, item: BoardItem, task_id: uuid.UUID) -> ProjectTask:
    task = (
        await db.execute(select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.board_item_id == item.id))
    ).scalar_one_or_none()
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found on this card")
    return task


async def add_todo_task(db: AsyncSession, item: BoardItem, project: Project, *, actor: User, title: str) -> dict:
    """A new row on a to-do card = a new task in the project's first Kanban
    list, linked back to the card."""
    _require_todo(item)
    existing = await _todo_tasks(db, item.id)
    if len(existing) >= MAX_TASKS_PER_TODO:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A to-do list holds at most {MAX_TASKS_PER_TODO} tasks.")
    first, _last = await _first_and_last_list(db, project.id)
    if first is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add a list on the Board tab before adding tasks.")
    task = await projects_service.create_task(
        db,
        project,
        list_id=first,
        title=_title(title, 255) or "Untitled task",
        description=None,
        due_date=None,
        assignee_id=None,
        actor=actor,
    )
    task.board_item_id = item.id
    task.todo_position = len(existing)
    await db.commit()
    await db.refresh(task)
    return await _broadcast_task(db, project, item.board_id, task)


async def update_todo_task(
    db: AsyncSession,
    item: BoardItem,
    project: Project,
    task: ProjectTask,
    *,
    actor: User,
    title: str | None = None,
    done: bool | None = None,
    due_date: date | None = None,
    clear_due_date: bool = False,
    assignee_id: uuid.UUID | None = None,
    clear_assignee: bool = False,
    position: int | None = None,
) -> dict:
    """Edit a row in place. Ticking it moves the task to the last Kanban list
    ("done"); unticking sends it back to the first."""
    first, last = await _first_and_last_list(db, project.id)
    if done is not None and first is not None and last is not None:
        is_done = task.list_id == last
        if done and not is_done:
            task = await projects_service.move_task(db, task, list_id=last, position=10_000)
        elif not done and is_done:
            target = first if first != last else last
            task = await projects_service.move_task(db, task, list_id=target, position=10_000)

    if title is not None or due_date is not None or clear_due_date or assignee_id is not None or clear_assignee:
        task = await projects_service.update_task(
            db,
            task,
            list_id=task.list_id,
            title=(_title(title, 255) or task.title) if title is not None else task.title,
            description=task.description,
            due_date=None if clear_due_date else (due_date if due_date is not None else task.due_date),
            assignee_id=None if clear_assignee else (assignee_id if assignee_id is not None else task.assignee_id),
            actor=actor,
        )

    if position is not None:
        siblings = [t for t in await _todo_tasks(db, item.id) if t.id != task.id]
        siblings.insert(max(0, min(position, len(siblings))), task)
        for i, sibling in enumerate(siblings):
            sibling.todo_position = i
        await db.commit()
        await db.refresh(task)
        for sibling in siblings:
            if sibling.id != task.id:
                await _broadcast_task(db, project, item.board_id, sibling)

    return await _broadcast_task(db, project, item.board_id, task)


async def attach_task(db: AsyncSession, item: BoardItem, project: Project, task: ProjectTask) -> dict:
    """Pull an existing Kanban task onto this to-do card (moving it off any
    other card it was on)."""
    _require_todo(item)
    if task.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    previous = task.board_item_id
    if previous == item.id:
        return await _broadcast_task(db, project, item.board_id, task)
    existing = await _todo_tasks(db, item.id)
    if len(existing) >= MAX_TASKS_PER_TODO:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A to-do list holds at most {MAX_TASKS_PER_TODO} tasks.")
    task.board_item_id = item.id
    task.todo_position = len(existing)
    await db.commit()
    await db.refresh(task)
    if previous is not None:
        old = await db.get(BoardItem, previous)
        if old is not None:
            await _broadcast_task_removed(db, project, old.board_id, old.id, task.id)
    return await _broadcast_task(db, project, item.board_id, task)


async def remove_todo_task(
    db: AsyncSession, item: BoardItem, project: Project, task: ProjectTask, *, delete_task: bool
) -> None:
    """Take a row off the card. By default the task survives on the Kanban;
    ``delete_task`` deletes it outright."""
    task_id = task.id
    if delete_task:
        await projects_service.delete_task(db, task)
    else:
        task.board_item_id = None
        task.todo_position = 0
        await db.commit()
    await _broadcast_task_removed(db, project, item.board_id, item.id, task_id)


async def sync_task_change(
    db: AsyncSession, project: Project, task_id: uuid.UUID, *, previous_item_id: uuid.UUID | None = None
) -> None:
    """Called by the Kanban endpoints after any task edit/move/delete, so a
    canvas showing that task as a to-do row stays live. ``previous_item_id``
    is the card it was on before (needed for a delete)."""
    task = await db.get(ProjectTask, task_id)
    if task is None:
        if previous_item_id is not None:
            card = await db.get(BoardItem, previous_item_id)
            if card is not None:
                await _broadcast_task_removed(db, project, card.board_id, card.id, task_id)
        return
    await db.refresh(task)
    if task.board_item_id is None:
        return
    card = await db.get(BoardItem, task.board_item_id)
    if card is not None:
        await _broadcast_task(db, project, card.board_id, task)


__all__ = [
    "ITEM_COLUMN",
    "ITEM_FILE",
    "ITEM_IMAGE",
    "ITEM_NOTE",
    "add_comment",
    "add_todo_task",
    "attach_task",
    "board_path",
    "board_read",
    "canvas_link",
    "comment_payload",
    "create_item",
    "decide_approval",
    "delete_comment",
    "delete_item",
    "file_card_content",
    "get_comment_or_404",
    "get_item_or_404",
    "get_or_create_board",
    "get_project_item_or_404",
    "get_todo_task_or_404",
    "item_meta",
    "item_payload",
    "list_board_tasks",
    "list_comments",
    "list_items",
    "list_versions",
    "move_item_to_board",
    "remove_todo_task",
    "request_approval",
    "resolve_board",
    "save_board_file",
    "save_board_image",
    "sync_task_change",
    "toggle_reaction",
    "update_item",
    "update_todo_task",
    "version_payload",
    "withdraw_approval",
]
