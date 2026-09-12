import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse

from binx_api.core.database import get_db
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.security import decode_ws_ticket
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.ai import service as ai_service
from binx_api.modules.ai.schemas import AiDraftRead
from binx_api.modules.messaging import realtime, service
from binx_api.modules.messaging.schemas import (
    ConversationCreate,
    ConversationDetailRead,
    ConversationRead,
    ConversationSettingsUpdate,
    ConversationUpdate,
    MessageRead,
    MessageUpdate,
    ParticipantAdd,
    UnreadSummaryRead,
)
from binx_api.modules.users.service import get_user_by_id

router = APIRouter(prefix="/agencies/{agency_id}/conversations", tags=["messaging"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


# ---- Conversations ---------------------------------------------------


@router.get("", response_model=list[ConversationRead])
async def list_conversations(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=255),
) -> list[ConversationRead]:
    agency, _role = agency_and_role
    rows = await service.list_conversations(
        db, agency, current_user, client_id=client_id, project_id=project_id, query_text=q
    )
    return [ConversationRead.model_validate(row) for row in rows]


@router.get("/unread-summary", response_model=UnreadSummaryRead)
async def unread_summary(db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember) -> UnreadSummaryRead:
    agency, _role = agency_and_role
    return UnreadSummaryRead(unread_total=await service.unread_total(db, agency, current_user))


@router.post("", response_model=ConversationDetailRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: ConversationCreate
) -> ConversationDetailRead:
    agency, _role = agency_and_role
    conversation = await service.create_conversation(
        db,
        agency,
        creator=current_user,
        kind=data.kind,
        title=data.title,
        participant_user_ids=data.participant_user_ids,
        client_id=data.client_id,
        project_id=data.project_id,
        initial_message=data.initial_message,
    )
    detail = await service.get_conversation_detail_or_404(db, agency.id, conversation.id, current_user)
    return ConversationDetailRead.model_validate(detail)


@router.get("/{conversation_id}", response_model=ConversationDetailRead)
async def read_conversation(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, conversation_id: uuid.UUID
) -> ConversationDetailRead:
    agency, _role = agency_and_role
    detail = await service.get_conversation_detail_or_404(db, agency.id, conversation_id, current_user)
    return ConversationDetailRead.model_validate(detail)


@router.patch("/{conversation_id}", response_model=ConversationDetailRead)
async def update_conversation(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    data: ConversationUpdate,
) -> ConversationDetailRead:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    await service.update_conversation(
        db, conversation, current_user, title=data.title, client_id=data.client_id, project_id=data.project_id
    )
    detail = await service.get_conversation_detail_or_404(db, agency.id, conversation_id, current_user)
    return ConversationDetailRead.model_validate(detail)


# ---- Participants ---------------------------------------------------


@router.post("/{conversation_id}/participants", response_model=ConversationDetailRead)
async def add_participants(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    data: ParticipantAdd,
) -> ConversationDetailRead:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    await service.add_participants(db, conversation, current_user, user_ids=data.user_ids)
    detail = await service.get_conversation_detail_or_404(db, agency.id, conversation_id, current_user)
    return ConversationDetailRead.model_validate(detail)


@router.delete("/{conversation_id}/participants/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_participant(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    await service.remove_participant(db, conversation, current_user, target_user_id=user_id)


# ---- Read state / settings -----------------------------------------


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, conversation_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    conversation, participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    await service.mark_read(db, conversation, participant)


@router.post("/{conversation_id}/ai/draft-reply", response_model=AiDraftRead)
async def generate_message_reply_draft(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, conversation_id: uuid.UUID
) -> AiDraftRead:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    draft = await ai_service.generate_message_reply(db, conversation, agency, actor=current_user)
    return AiDraftRead(draft=draft)


@router.patch("/{conversation_id}/settings", response_model=ConversationDetailRead)
async def update_settings(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    data: ConversationSettingsUpdate,
) -> ConversationDetailRead:
    agency, _role = agency_and_role
    _conversation, participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    await service.set_muted(db, participant, is_muted=data.is_muted)
    detail = await service.get_conversation_detail_or_404(db, agency.id, conversation_id, current_user)
    return ConversationDetailRead.model_validate(detail)


# ---- Messages ------------------------------------------------------


@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
async def list_messages(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = None,
) -> list[MessageRead]:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    return await service.list_messages(db, conversation, limit=limit, before=before)


@router.post("/{conversation_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    body: Annotated[str, Form(max_length=8192)] = "",
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> MessageRead:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    uploads: list[tuple[str, bytes, str]] = []
    for upload in files or []:
        uploads.append(
            (upload.filename or "upload", await upload.read(), upload.content_type or "application/octet-stream")
        )
    return await service.post_message(db, conversation, sender=current_user, body=body, uploads=uploads)


@router.patch("/{conversation_id}/messages/{message_id}", response_model=MessageRead)
async def edit_message(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    data: MessageUpdate,
) -> MessageRead:
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    message = await service.get_message_or_404(db, conversation.id, message_id)
    return await service.edit_message(db, conversation, message, current_user, body=data.body)


@router.delete("/{conversation_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
) -> None:
    agency, role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    message = await service.get_message_or_404(db, conversation.id, message_id)
    await service.delete_message(db, conversation, message, requested_by=current_user, requester_role=role)


@router.get("/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/download")
async def download_attachment(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    attachment_id: uuid.UUID,
):
    agency, _role = agency_and_role
    conversation, _participant = await service.get_conversation_for_participant_or_404(
        db, agency.id, conversation_id, current_user
    )
    attachment = await service.get_attachment_or_404(db, conversation.id, message_id, attachment_id)
    return FileResponse(path=attachment.storage_path, filename=attachment.file_name, media_type=attachment.mime_type)


# ---- Websocket ------------------------------------------------------
# Registered without the agency prefix — one socket per browser carries every
# agency's events. Auth is a short-lived ticket from POST /auth/ws-ticket
# (the browser can't set the bearer header on the handshake). See realtime.py.

ws_router = APIRouter()


@ws_router.websocket("/ws/messages")
async def messages_socket(websocket: WebSocket, ticket: str = Query(...), db=Depends(get_db)) -> None:
    subject = decode_ws_ticket(ticket)
    if subject is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await realtime.manager.connect(user_id, websocket)
    try:
        while True:
            payload = await websocket.receive_json()
            if not isinstance(payload, dict):
                continue
            kind = payload.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
            elif kind == "typing":
                try:
                    conversation_id = uuid.UUID(str(payload.get("conversation_id")))
                except ValueError:
                    continue
                targets = await service.typing_participants(db, conversation_id, user)
                if targets:
                    await realtime.manager.send_to_users(
                        targets,
                        {
                            "type": realtime.EVENT_TYPING,
                            "conversation_id": str(conversation_id),
                            "data": {"user_id": str(user.id), "user_name": user.full_name},
                        },
                    )
    except WebSocketDisconnect:
        pass
    finally:
        await realtime.manager.disconnect(user_id, websocket)
