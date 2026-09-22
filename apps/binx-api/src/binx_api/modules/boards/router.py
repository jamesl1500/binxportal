"""Staff-side collaboration-canvas endpoints, under a project.

``/agencies/{agency_id}/projects/{project_id}/board`` — any agency member, the
same gate as the rest of day-to-day project work. The client-portal side of
the same canvas lives in ``client_portal/router.py``; both delegate to
``boards/service.py``.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.boards import service
from binx_api.modules.boards.models import AUTHOR_AGENCY, ITEM_IMAGE
from binx_api.modules.boards.schemas import (
    BoardCommentCreate,
    BoardCommentRead,
    BoardItemCreate,
    BoardItemRead,
    BoardItemUpdate,
    BoardReactionsRead,
    BoardReactionToggle,
    BoardRead,
)
from binx_api.modules.projects import service as projects_service

# NB: ".../board" (singular, no items) is the Kanban board in projects/router.py.
# The freeform collaboration canvas lives under ".../canvas".
router = APIRouter(prefix="/agencies/{agency_id}/projects/{project_id}/canvas", tags=["boards"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


@router.get("", response_model=BoardRead)
async def read_board(
    db: DbSession, project_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> BoardRead:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.get_or_create_board(db, project)
    rows = await service.board_read_items(db, board.id, current_user.id)
    return BoardRead(board_id=board.id, items=[BoardItemRead(**row) for row in rows])


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
    board = await service.get_or_create_board(db, project)
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
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.get_or_create_board(db, project)
    item = await service.get_item_or_404(db, board.id, item_id)
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
    )
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(db: DbSession, project_id: uuid.UUID, item_id: uuid.UUID, agency_and_role: AnyMember) -> None:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.get_or_create_board(db, project)
    item = await service.get_item_or_404(db, board.id, item_id)
    await service.delete_item(db, item, project)


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
) -> BoardItemRead:
    agency, _role = agency_and_role
    project = await projects_service.get_project_or_404(db, agency.id, project_id)
    board = await service.get_or_create_board(db, project)

    content = await file.read()
    stored = await service.save_board_image(
        db,
        project,
        uploaded_by=current_user,
        file_name=file.filename or "image",
        content=content,
        mime_type=file.content_type or "application/octet-stream",
    )
    item = await service.create_item(
        db,
        board,
        project,
        actor=current_user,
        author_kind=AUTHOR_AGENCY,
        type_=ITEM_IMAGE,
        x=x,
        y=y,
        width=width,
        height=height,
        content={"file_id": str(stored.id), "file_name": stored.file_name},
        color=None,
    )
    return BoardItemRead(**await service.item_read(db, item, current_user.id))


@router.get("/images/{file_id}")
async def download_image(db: DbSession, project_id: uuid.UUID, file_id: uuid.UUID, agency_and_role: AnyMember):
    agency, _role = agency_and_role
    await projects_service.get_project_or_404(db, agency.id, project_id)
    file_record = await projects_service.get_project_file_or_404(db, project_id, file_id)
    return FileResponse(path=file_record.storage_path, filename=file_record.file_name, media_type=file_record.mime_type)


# --- Reactions + comments ---


async def _item(db: DbSession, agency_id: uuid.UUID, project_id: uuid.UUID, item_id: uuid.UUID):
    project = await projects_service.get_project_or_404(db, agency_id, project_id)
    board = await service.get_or_create_board(db, project)
    return project, await service.get_item_or_404(db, board.id, item_id)


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
# decides (client_portal/router.py's approval/decide).


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
