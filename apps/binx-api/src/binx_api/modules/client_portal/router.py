import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.exceptions import HTTPException
from fastapi.responses import FileResponse

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.boards import service as boards_service
from binx_api.modules.boards.models import AUTHOR_CLIENT, ITEM_IMAGE
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
from binx_api.modules.client_portal import service
from binx_api.modules.client_portal.dependencies import PortalContext
from binx_api.modules.client_portal.schemas import (
    ClientInvitationAccept,
    ClientInvitationPreview,
    PortalContactRead,
    PortalContextRead,
    PortalMembershipRead,
    PortalProjectDetailRead,
    PortalProjectRead,
    PortalTaskListRead,
)
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.router import _detail_read, _invoice_read
from binx_api.modules.invoicing.schemas import CheckoutSessionRead, InvoiceDetailRead, InvoiceRead
from binx_api.modules.meetings import service as meetings_service
from binx_api.modules.meetings.models import CREATED_BY_CLIENT
from binx_api.modules.meetings.router import _meeting_read
from binx_api.modules.meetings.schemas import MeetingRead, PortalMeetingCreate, PortalMeetingSettingsRead, SlotRead
from binx_api.modules.messaging import service as messaging_service
from binx_api.modules.messaging.models import SENDER_CLIENT
from binx_api.modules.messaging.schemas import ConversationDetailRead, ConversationRead, MessageRead
from binx_api.modules.projects import service as projects_service

router = APIRouter(prefix="/portal", tags=["client-portal"])

_PAYABLE_STATUSES = {"sent", "overdue", "partial"}


# ---- Invitation preview / accept (no ClientContact required yet) --------


@router.get("/invitations/preview", response_model=ClientInvitationPreview)
async def preview_invitation(db: DbSession, token: str) -> ClientInvitationPreview:
    invitation, agency, client, inviter = await service.preview_client_invitation(db, token)
    return ClientInvitationPreview(
        agency_name=agency.name,
        client_name=client.name,
        invited_by_name=inviter.full_name,
        email=invitation.email,
    )


@router.post("/invitations/accept", response_model=PortalContextRead)
async def accept_invitation(
    db: DbSession, current_user: CurrentUser, data: ClientInvitationAccept
) -> PortalContextRead:
    await service.accept_client_invitation(db, data.token, accepting_user=current_user)
    return await _context(db, current_user)


# ---- Context ----------------------------------------------------------


async def _context(db: DbSession, user: CurrentUser) -> PortalContextRead:
    memberships = await service.get_portal_memberships(db, user)
    if not memberships:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has no client portal access")
    agency, client, contact = memberships[0]
    membership_reads = [
        PortalMembershipRead(
            agency=await service.portal_agency_read(db, ag), client=await service.portal_client_read(db, cl)
        )
        for ag, cl, _c in memberships
    ]
    return PortalContextRead(
        agency=await service.portal_agency_read(db, agency),
        client=await service.portal_client_read(db, client),
        contact=PortalContactRead(
            id=contact.id,
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            title=contact.title,
            is_primary=contact.is_primary,
        ),
        memberships=membership_reads,
    )


@router.get("/context", response_model=PortalContextRead)
async def read_context(db: DbSession, current_user: CurrentUser, membership: PortalContext) -> PortalContextRead:
    return await _context(db, current_user)


# ---- Projects + progress --------------------------------------------


def _project_read(project, progress) -> PortalProjectRead:
    return PortalProjectRead(
        id=project.id,
        name=project.name,
        status=project.status,
        description=project.description,
        start_date=project.start_date,
        due_date=project.due_date,
        progress=progress,
    )


@router.get("/projects", response_model=list[PortalProjectRead])
async def list_projects(db: DbSession, membership: PortalContext) -> list[PortalProjectRead]:
    _agency, client, _contact = membership
    rows = await service.list_portal_projects(db, client.id)
    return [_project_read(project, progress) for project, progress in rows]


@router.get("/projects/{project_id}", response_model=PortalProjectDetailRead)
async def read_project(db: DbSession, membership: PortalContext, project_id: uuid.UUID) -> PortalProjectDetailRead:
    _agency, client, _contact = membership
    project = await service.get_portal_project_or_404(db, client.id, project_id)
    progress, columns = await service.portal_project_detail(db, project)
    return PortalProjectDetailRead(**_project_read(project, progress).model_dump(), columns=columns)


# ---- Task board (read-only) -----------------------------------------
# The same columns/tasks the agency team works in on /projects/.../board,
# trimmed to what a client should see — see portal_task_board's docstring.


@router.get("/projects/{project_id}/board", response_model=list[PortalTaskListRead])
async def read_task_board(db: DbSession, membership: PortalContext, project_id: uuid.UUID) -> list[PortalTaskListRead]:
    _agency, client, _contact = membership
    project = await service.get_portal_project_or_404(db, client.id, project_id)
    return await service.portal_task_board(db, project.id)


# ---- Collaboration canvas ------------------------------------------
# The same board the agency team edits at /agencies/.../projects/.../board —
# clients get full collaboration (add / move / edit / delete any card). All
# mutations go through boards/service.py, which broadcasts to the team + every
# portal contact over the shared websocket.


async def _portal_project_and_board(db, client_id: uuid.UUID, project_id: uuid.UUID):
    project = await service.get_portal_project_or_404(db, client_id, project_id)
    board = await boards_service.get_or_create_board(db, project)
    return project, board


@router.get("/projects/{project_id}/canvas", response_model=BoardRead)
async def read_board(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, project_id: uuid.UUID
) -> BoardRead:
    _agency, client, _contact = membership
    _project, board = await _portal_project_and_board(db, client.id, project_id)
    rows = await boards_service.board_read_items(db, board.id, current_user.id)
    return BoardRead(board_id=board.id, items=[BoardItemRead(**row) for row in rows])


@router.post("/projects/{project_id}/canvas/items", response_model=BoardItemRead, status_code=status.HTTP_201_CREATED)
async def create_board_item(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, project_id: uuid.UUID, data: BoardItemCreate
) -> BoardItemRead:
    _agency, client, _contact = membership
    project, board = await _portal_project_and_board(db, client.id, project_id)
    item = await boards_service.create_item(
        db,
        board,
        project,
        actor=current_user,
        author_kind=AUTHOR_CLIENT,
        type_=data.type,
        x=data.x,
        y=data.y,
        width=data.width,
        height=data.height,
        content=data.content,
        color=data.color,
    )
    return BoardItemRead(**await boards_service.item_read(db, item, current_user.id))


@router.patch("/projects/{project_id}/canvas/items/{item_id}", response_model=BoardItemRead)
async def update_board_item(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardItemUpdate,
) -> BoardItemRead:
    _agency, client, _contact = membership
    project, board = await _portal_project_and_board(db, client.id, project_id)
    item = await boards_service.get_item_or_404(db, board.id, item_id)
    item = await boards_service.update_item(
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
    return BoardItemRead(**await boards_service.item_read(db, item, current_user.id))


@router.delete("/projects/{project_id}/canvas/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board_item(
    db: DbSession, membership: PortalContext, project_id: uuid.UUID, item_id: uuid.UUID
) -> None:
    _agency, client, _contact = membership
    project, board = await _portal_project_and_board(db, client.id, project_id)
    item = await boards_service.get_item_or_404(db, board.id, item_id)
    await boards_service.delete_item(db, item, project)


@router.post("/projects/{project_id}/canvas/images", response_model=BoardItemRead, status_code=status.HTTP_201_CREATED)
async def upload_board_image(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    project_id: uuid.UUID,
    file: Annotated[UploadFile, File()],
    x: float = 0.0,
    y: float = 0.0,
    width: float | None = None,
    height: float | None = None,
) -> BoardItemRead:
    _agency, client, _contact = membership
    project, board = await _portal_project_and_board(db, client.id, project_id)
    stored = await boards_service.save_board_image(
        db,
        project,
        uploaded_by=current_user,
        file_name=file.filename or "image",
        content=await file.read(),
        mime_type=file.content_type or "application/octet-stream",
    )
    item = await boards_service.create_item(
        db,
        board,
        project,
        actor=current_user,
        author_kind=AUTHOR_CLIENT,
        type_=ITEM_IMAGE,
        x=x,
        y=y,
        width=width,
        height=height,
        content={"file_id": str(stored.id), "file_name": stored.file_name},
        color=None,
    )
    return BoardItemRead(**await boards_service.item_read(db, item, current_user.id))


@router.get("/projects/{project_id}/canvas/images/{file_id}")
async def download_board_image(db: DbSession, membership: PortalContext, project_id: uuid.UUID, file_id: uuid.UUID):
    _agency, client, _contact = membership
    project = await service.get_portal_project_or_404(db, client.id, project_id)
    file_record = await projects_service.get_project_file_or_404(db, project.id, file_id)
    return FileResponse(path=file_record.storage_path, filename=file_record.file_name, media_type=file_record.mime_type)


@router.get("/logo")
async def download_portal_logo(db: DbSession, membership: PortalContext):
    agency, client, _contact = membership
    resolved = await service.portal_logo_path(db, agency, client)
    if resolved is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No logo set")
    path, mime_type = resolved
    return FileResponse(path=path, media_type=mime_type)


async def _portal_item(db, client_id: uuid.UUID, project_id: uuid.UUID, item_id: uuid.UUID):
    project, board = await _portal_project_and_board(db, client_id, project_id)
    return project, await boards_service.get_item_or_404(db, board.id, item_id)


@router.post("/projects/{project_id}/canvas/items/{item_id}/reactions", response_model=BoardReactionsRead)
async def toggle_board_reaction(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardReactionToggle,
) -> BoardReactionsRead:
    _agency, client, _contact = membership
    project, item = await _portal_item(db, client.id, project_id, item_id)
    await boards_service.toggle_reaction(db, item, project, user=current_user, kind=data.kind)
    meta = (await boards_service.item_meta(db, [item.id], current_user.id))[item.id]
    return BoardReactionsRead(reactions=meta["reactions"], my_reactions=meta["my_reactions"])


@router.get("/projects/{project_id}/canvas/items/{item_id}/comments", response_model=list[BoardCommentRead])
async def list_board_comments(
    db: DbSession, membership: PortalContext, project_id: uuid.UUID, item_id: uuid.UUID
) -> list[BoardCommentRead]:
    _agency, client, _contact = membership
    _project, item = await _portal_item(db, client.id, project_id, item_id)
    comments = await boards_service.list_comments(db, item.id)
    return [BoardCommentRead(**boards_service.comment_payload(c)) for c in comments]


@router.post(
    "/projects/{project_id}/canvas/items/{item_id}/comments",
    response_model=BoardCommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_board_comment(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoardCommentCreate,
) -> BoardCommentRead:
    _agency, client, _contact = membership
    project, item = await _portal_item(db, client.id, project_id, item_id)
    comment = await boards_service.add_comment(
        db, item, project, author=current_user, author_kind=AUTHOR_CLIENT, body=data.body
    )
    return BoardCommentRead(**boards_service.comment_payload(comment))


@router.delete(
    "/projects/{project_id}/canvas/items/{item_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_board_comment(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    comment_id: uuid.UUID,
) -> None:
    _agency, client, _contact = membership
    project, item = await _portal_item(db, client.id, project_id, item_id)
    comment = await boards_service.get_comment_or_404(db, item.id, comment_id)
    # Portal contacts have no agency role — author-only deletion.
    await boards_service.delete_comment(db, comment, project, requested_by=current_user, requester_role="member")


# ---- Invoices ------------------------------------------------------


@router.get("/invoices", response_model=list[InvoiceRead])
async def list_invoices(db: DbSession, membership: PortalContext) -> list[InvoiceRead]:
    agency, client, _contact = membership
    rows = await invoicing_service.list_invoices(db, agency.id, client_id=client.id)
    # Clients never see drafts — those aren't real bills yet.
    return [
        _invoice_read(invoice, client_name, project_name)
        for invoice, client_name, project_name in rows
        if invoice.status != "draft"
    ]


async def _portal_invoice_or_404(db, agency_id: uuid.UUID, client_id: uuid.UUID, invoice_id: uuid.UUID):
    invoice = await invoicing_service.get_invoice_or_404(db, agency_id, invoice_id)
    if invoice.client_id != client_id or invoice.status == "draft":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return invoice


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
async def read_invoice(db: DbSession, membership: PortalContext, invoice_id: uuid.UUID) -> InvoiceDetailRead:
    agency, client, _contact = membership
    invoice = await _portal_invoice_or_404(db, agency.id, client.id, invoice_id)
    return _detail_read(invoice, *(await invoicing_service.get_invoice_context(db, invoice)))


@router.post("/invoices/{invoice_id}/pay", response_model=CheckoutSessionRead)
async def pay_invoice(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, invoice_id: uuid.UUID
) -> CheckoutSessionRead:
    """Starts a real Stripe Checkout Session on the agency's own connected
    account and returns the URL to redirect to. A deliberate break from the
    old stub's "returns the paid invoice" contract — a hosted-Checkout
    redirect can't be synchronous. The payment itself is recorded by the
    Connect webhook once Stripe confirms it (see invoicing/webhooks_router.py)."""
    agency, client, _contact = membership
    invoice = await _portal_invoice_or_404(db, agency.id, client.id, invoice_id)
    if invoicing_service._display_status(invoice) not in _PAYABLE_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invoice isn't awaiting payment")

    billing_settings = await invoicing_service.get_or_create_billing_settings(db, agency)
    if not billing_settings.stripe_connect_charges_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Online payment isn't set up for this agency yet")

    checkout_url = await invoicing_service.start_invoice_checkout(
        db, invoice, agency, billing_settings, paid_by=current_user
    )
    return CheckoutSessionRead(checkout_url=checkout_url)


# ---- Meetings ------------------------------------------------------


@router.get("/meeting-settings", response_model=PortalMeetingSettingsRead)
async def read_portal_meeting_settings(db: DbSession, membership: PortalContext) -> PortalMeetingSettingsRead:
    agency, _client, _contact = membership
    settings = await meetings_service.get_or_create_meeting_settings(db, agency)
    return PortalMeetingSettingsRead.model_validate(settings, from_attributes=True)


@router.get("/meetings/slots", response_model=list[SlotRead])
async def read_portal_available_slots(
    db: DbSession,
    membership: PortalContext,
    from_date: date = Query(...),
    to_date: date | None = Query(default=None),
) -> list[SlotRead]:
    agency, _client, _contact = membership
    settings = await meetings_service.get_or_create_meeting_settings(db, agency)
    if not settings.self_booking_enabled:
        return []
    slots = await meetings_service.get_available_slots(db, agency, from_date=from_date, to_date=to_date)
    return [SlotRead(starts_at=starts_at, ends_at=ends_at) for starts_at, ends_at in slots]


@router.get("/meetings", response_model=list[MeetingRead])
async def list_portal_meetings(
    db: DbSession, membership: PortalContext, status_filter: str | None = Query(default=None, alias="status")
) -> list[MeetingRead]:
    agency, client, _contact = membership
    rows = await meetings_service.list_meetings(db, agency.id, client_id=client.id, status_filter=status_filter)
    return [_meeting_read(meeting, client_name, project_name) for meeting, client_name, project_name in rows]


@router.post("/meetings", response_model=MeetingRead, status_code=status.HTTP_201_CREATED)
async def book_portal_meeting(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, data: PortalMeetingCreate
) -> MeetingRead:
    agency, client, _contact = membership
    settings = await meetings_service.get_or_create_meeting_settings(db, agency)
    if not settings.self_booking_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Self-service booking isn't enabled for this agency")
    meeting = await meetings_service.book_slot(
        db,
        agency,
        client,
        starts_at=data.starts_at,
        project_id=data.project_id,
        title=data.title,
        notes=data.notes,
        location=None,
        booked_by=current_user,
        booked_by_kind=CREATED_BY_CLIENT,
        bypass_notice_window=False,
    )
    return _meeting_read(*(await meetings_service.get_meeting_with_names_or_404(db, agency.id, meeting.id)))


async def _portal_meeting_or_404(db, agency_id: uuid.UUID, client_id: uuid.UUID, meeting_id: uuid.UUID):
    meeting = await meetings_service.get_meeting_or_404(db, agency_id, meeting_id)
    if meeting.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


@router.post("/meetings/{meeting_id}/cancel", response_model=MeetingRead)
async def cancel_portal_meeting(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, meeting_id: uuid.UUID
) -> MeetingRead:
    agency, client, _contact = membership
    meeting = await _portal_meeting_or_404(db, agency.id, client.id, meeting_id)
    await meetings_service.cancel_meeting(
        db, meeting, agency, client, cancelled_by=current_user, cancelled_by_kind=CREATED_BY_CLIENT
    )
    return _meeting_read(*(await meetings_service.get_meeting_with_names_or_404(db, agency.id, meeting_id)))


# ---- Messages ------------------------------------------------------


async def _portal_conversation_or_404(db, agency, client_id: uuid.UUID, conversation_id: uuid.UUID, user):
    conversation, participant = await messaging_service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, user
    )
    if conversation.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation, participant


@router.get("/conversations", response_model=list[ConversationRead])
async def list_conversations(
    db: DbSession, current_user: CurrentUser, membership: PortalContext
) -> list[ConversationRead]:
    agency, client, _contact = membership
    rows = await messaging_service.list_conversations(db, agency, current_user)
    return [ConversationRead.model_validate(row) for row in rows if row["client_id"] == client.id]


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailRead)
async def read_conversation(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, conversation_id: uuid.UUID
) -> ConversationDetailRead:
    agency, client, _contact = membership
    await _portal_conversation_or_404(db, agency, client.id, conversation_id, current_user)
    detail = await messaging_service.get_conversation_detail_or_404(db, agency.id, conversation_id, current_user)
    return ConversationDetailRead.model_validate(detail)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageRead])
async def list_messages(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    conversation_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = None,
) -> list[MessageRead]:
    agency, client, _contact = membership
    conversation, _p = await _portal_conversation_or_404(db, agency, client.id, conversation_id, current_user)
    return await messaging_service.list_messages(db, conversation, limit=limit, before=before)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_message(
    db: DbSession,
    current_user: CurrentUser,
    membership: PortalContext,
    conversation_id: uuid.UUID,
    body: Annotated[str, Form(max_length=8192)] = "",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> MessageRead:
    agency, client, _contact = membership
    conversation, _p = await _portal_conversation_or_404(db, agency, client.id, conversation_id, current_user)
    uploads: list[tuple[str, bytes, str]] = []
    for upload in files or []:
        uploads.append(
            (upload.filename or "upload", await upload.read(), upload.content_type or "application/octet-stream")
        )
    return await messaging_service.post_message(
        db, conversation, sender=current_user, body=body, uploads=uploads, sender_kind=SENDER_CLIENT
    )


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    db: DbSession, current_user: CurrentUser, membership: PortalContext, conversation_id: uuid.UUID
) -> None:
    agency, client, _contact = membership
    conversation, participant = await _portal_conversation_or_404(db, agency, client.id, conversation_id, current_user)
    await messaging_service.mark_read(db, conversation, participant)
