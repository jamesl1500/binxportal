"""Staff-side collaboration-canvas endpoints, under a project.

``/agencies/{agency_id}/projects/{project_id}/canvas`` — any agency member, the
same gate as the rest of day-to-day project work. The client-portal side of
the same canvas lives in ``client_portal/router.py``; both delegate to
``boards/service.py``.

A project's canvas is a tree of boards (Milanote's boards-in-boards): ``GET
""`` takes ``?board_id=`` (root when omitted), and every item endpoint finds
its card on whichever of the project's boards it lives on.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status

from binx_api.core import storage
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.boards import service
from binx_api.modules.boards.models import AUTHOR_AGENCY, DEFAULT_NOTE_WIDTH, ITEM_FILE, ITEM_IMAGE
from binx_api.modules.boards.schemas import (
    BoardCommentCreate,
    BoardCommentRead,
    BoardItemCreate,
    BoardItemRead,
    BoardItemUpdate,
    BoardItemVersionRead,
    BoardReactionsRead,
    BoardReactionToggle,
    BoardRead,
    BoardTaskAttach,
    BoardTaskCreate,
    BoardTaskRead,
    BoardTaskUpdate,
)
from binx_api.modules.projects import service as projects_service

# NB: ".../board" (singular, no items) is the Kanban board in projects/router.py.
# The freeform collaboration canvas lives under ".../canvas".
router = APIRouter(prefix="/agencies/{agency_id}/projects/{project_id}/canvas", tags=["boards"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]

# A file card's resting size — a compact tile, not a note-sized block.
_FILE_CARD_HEIGHT = 72.0


@router.get("", response_model=BoardRead)
async def read_board(
    db: DbSession,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    board_id: uuid.UUID | None = None,
) -> BoardRead:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.resolve_board(db, project, board_id)
    return BoardRead(**await service.board_read(db, project, board, current_user.id, include_assignee=True))


@router.post("/items", response_model=BoardItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(
    db: DbSession,
    project_id: uuid.UUID,
    data: BoardItemCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardItemRead:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.resolve_board(db, project, data.board_id)
    item = await service.create_item(
        db,
        board,
        project,
        actor=current_user,
        author_kind=AUTHOR_AGENCY,
        type_=data.type,
        x=data.x,
        y=data.y,
        width=data.width,
        height=data.height,
        content=data.content,
        color=data.color,
        parent_id=data.parent_id,
        position=data.position,
    )
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.patch("/items/{item_id}", response_model=BoardItemRead)
async def update_item(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardItemUpdate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardItemRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    item = await service.update_item(
        db,
        item,
        project,
        x=data.x,
        y=data.y,
        width=data.width,
        height=data.height,
        z=data.z,
        content=data.content,
        color=data.color,
        clear_color=data.clear_color,
        parent_id=data.parent_id,
        clear_parent=data.clear_parent,
        position=data.position,
        board_id=data.board_id,
    )
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(db: DbSession, project_id: uuid.UUID, item_id: uuid.UUID, agency_and_role: AnyMember) -> None:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    await service.delete_item(db, item, project)


async def _upload_card(
    db: DbSession,
    *,
    agency_id: uuid.UUID,
    project_id: uuid.UUID,
    current_user,
    file: UploadFile,
    kind: str,
    board_id: uuid.UUID | None,
    parent_id: uuid.UUID | None,
    x: float,
    y: float,
    width: float | None,
    height: float | None,
) -> BoardItemRead:
    project = await projects_service.get_project_or_404(db, agency_id, project_id)
    board = await service.resolve_board(db, project, board_id)
    content = await file.read()
    save = service.save_board_image if kind == ITEM_IMAGE else service.save_board_file
    stored = await save(
        db,
        project,
        uploaded_by=current_user,
        file_name=file.filename or ("image" if kind == ITEM_IMAGE else "file"),
        content=content,
        mime_type=file.content_type or "application/octet-stream",
    )
    if kind == ITEM_FILE:
        width = width or DEFAULT_NOTE_WIDTH + 20
        height = height or _FILE_CARD_HEIGHT
    item = await service.create_item(
        db,
        board,
        project,
        actor=current_user,
        author_kind=AUTHOR_AGENCY,
        type_=kind,
        x=x,
        y=y,
        width=width,
        height=height,
        content=service.file_card_content(stored),
        color=None,
        parent_id=parent_id,
    )
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.post("/images", response_model=BoardItemRead, status_code=status.HTTP_201_CREATED)
async def upload_image(
    db: DbSession,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    file: Annotated[UploadFile, File()],
    x: float = 0.0,
    y: float = 0.0,
    width: float | None = None,
    height: float | None = None,
    board_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> BoardItemRead:
    agency, _role = agency_and_role
    return await _upload_card(
        db,
        agency_id=agency.id,
        project_id=project_id,
        current_user=current_user,
        file=file,
        kind=ITEM_IMAGE,
        board_id=board_id,
        parent_id=parent_id,
        x=x,
        y=y,
        width=width,
        height=height,
    )


@router.post("/files", response_model=BoardItemRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    db: DbSession,
    project_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    file: Annotated[UploadFile, File()],
    x: float = 0.0,
    y: float = 0.0,
    board_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> BoardItemRead:
    agency, _role = agency_and_role
    return await _upload_card(
        db,
        agency_id=agency.id,
        project_id=project_id,
        current_user=current_user,
        file=file,
        kind=ITEM_FILE,
        board_id=board_id,
        parent_id=parent_id,
        x=x,
        y=y,
        width=None,
        height=None,
    )


@router.get("/images/{file_id}")
async def download_image(db: DbSession, project_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember):
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    file_record = await projects_service.get_project_file_or_404(db, project_id, file_id)
    return await storage.response(
        file_record.storage_path, filename=file_record.file_name, media_type=file_record.mime_type
    )


# --- Reactions + comments ---


async def _item(db: DbSession, agency_id: uuid.UUID, project_id: uuid.UUID, item_id: uuid.UUID):
    project = await projects_service.get_project_or_404(db, agency_id, project_id)
    return project, await service.get_project_item_or_404(db, project, item_id)


@router.post("/items/{item_id}/reactions", response_model=BoardReactionsRead)
async def toggle_reaction(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardReactionToggle,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardReactionsRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    await service.toggle_reaction(db, item, project, user=current_user, kind=data.kind)
    meta = (await service.item_meta(db, [item.id], current_user.id))[item.id]
    return BoardReactionsRead(reactions=meta["reactions"], my_reactions=meta["my_reactions"])


@router.get("/items/{item_id}/comments", response_model=list[BoardCommentRead])
async def list_comments(
    db: DbSession, project_id: uuid.UUID, item_id: uuid.UUID, agency_and_role: AnyMember
) -> list[BoardCommentRead]:
    agency, _role = agency_and_role
    _project, item = await _item(db, agency.id, project_id, item_id)
    return [BoardCommentRead(**service.comment_payload(c)) for c in await service.list_comments(db, item.id)]


@router.post("/items/{item_id}/comments", response_model=BoardCommentRead, status_code=status.HTTP_201_CREATED)
async def add_comment(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardCommentCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardCommentRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    comment = await service.add_comment(
        db, item, project, author=current_user, author_kind=AUTHOR_AGENCY, body=data.body
    )
    return BoardCommentRead(**service.comment_payload(comment))


@router.delete("/items/{item_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> None:
    agency, role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    comment = await service.get_comment_or_404(db, item.id, comment_id)
    await service.delete_comment(db, comment, project, requested_by=current_user, requester_role=role)


# --- Client approval ---
# Only the agency side requests/withdraws; only the client-portal side
# decides (client_portal/router.py's approval/decide). On a column, each
# acts on every approvable card in its stack.


@router.post("/items/{item_id}/approval/request", response_model=BoardItemRead)
async def request_item_approval(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardItemRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    item = await service.request_approval(db, item, project, actor=current_user)
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.post("/items/{item_id}/approval/withdraw", response_model=BoardItemRead)
async def withdraw_item_approval(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardItemRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    item = await service.withdraw_approval(db, item, project)
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.get("/items/{item_id}/versions", response_model=list[BoardItemVersionRead])
async def list_item_versions(
    db: DbSession, project_id: uuid.UUID, item_id: uuid.UUID, agency_and_role: AnyMember
) -> list[BoardItemVersionRead]:
    agency, _role = agency_and_role
    _project, item = await _item(db, agency.id, project_id, item_id)
    return [BoardItemVersionRead(**service.version_payload(v)) for v in await service.list_versions(db, item.id)]


# --- To-do cards ---
# Rows are real ProjectTasks. Agency-only — the portal shows them read-only.


@router.post("/items/{item_id}/tasks", response_model=BoardTaskRead, status_code=status.HTTP_201_CREATED)
async def add_todo_task(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardTaskCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardTaskRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    return BoardTaskRead(**await service.add_todo_task(db, item, project, actor=current_user, title=data.title))


@router.post("/items/{item_id}/tasks/attach", response_model=BoardTaskRead)
async def attach_todo_task(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardTaskAttach,
    agency_and_role: AnyMember,
) -> BoardTaskRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    task = await projects_service.get_task_or_404(db, project.id, data.task_id)
    return BoardTaskRead(**await service.attach_task(db, item, project, task))


@router.patch("/items/{item_id}/tasks/{task_id}", response_model=BoardTaskRead)
async def update_todo_task(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    task_id: uuid.UUID,
    data: BoardTaskUpdate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> BoardTaskRead:
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    task = await service.get_todo_task_or_404(db, item, task_id)
    return BoardTaskRead(
        **await service.update_todo_task(
            db,
            item,
            project,
            task,
            actor=current_user,
            title=data.title,
            done=data.done,
            due_date=data.due_date,
            clear_due_date=data.clear_due_date,
            assignee_id=data.assignee_id,
            clear_assignee=data.clear_assignee,
            position=data.position,
        )
    )


@router.delete("/items/{item_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_todo_task(
    db: DbSession,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    task_id: uuid.UUID,
    agency_and_role: AnyMember,
    delete_task: bool = False,
) -> None:
    """Take a row off the card — the task stays on the Kanban unless
    ``?delete_task=true``."""
    agency, _role = agency_and_role
    project, item = await _item(db, agency.id, project_id, item_id)
    task = await service.get_todo_task_or_404(db, item, task_id)
    await service.remove_todo_task(db, item, project, task, delete_task=delete_task)
