"""Service layer for agency messaging.

Conversations are agency-scoped and visible only to their participants. Every
mutating function here, after it commits, pushes a websocket event to the
affected participants via ``realtime.manager`` — the HTTP response and the
live update come from the same call. Message payloads are serialised in full
(clients append them directly); everything else is a lightweight signal the
client reconciles with a refetch.
"""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from binx_api.core.config import get_settings
from binx_api.core.images import image_version
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.messaging import realtime
from binx_api.modules.messaging.models import (
    KIND_DIRECT,
    KIND_GROUP,
    MESSAGE_SYSTEM,
    MESSAGE_USER,
    SENDER_USER,
    Conversation,
    ConversationParticipant,
    Message,
    MessageAttachment,
)
from binx_api.modules.messaging.schemas import MessageAttachmentRead, MessageRead
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_MESSAGES, EVENT_MENTION
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import User, UserProfile

settings = get_settings()


# ---- Upload helpers (same approach as projects/service.py) -----------------


def _write_upload(directory: Path, file_name: str, content: bytes) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    stored_path = directory / f"{uuid.uuid4().hex}_{file_name}"
    stored_path.write_bytes(content)
    return stored_path


def _unlink_quietly(storage_path: str) -> None:
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        pass


def _validate_attachment(content: bytes) -> None:
    """Message attachments accept any type (like project-level files, unlike
    task files) — only the per-file size cap is enforced."""
    if len(content) > settings.message_upload_max_bytes:
        max_mb = settings.message_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")


# ---- Serialisation --------------------------------------------------------


def _attachment_read(attachment: MessageAttachment, uploader_name: str | None) -> MessageAttachmentRead:
    return MessageAttachmentRead(
        id=attachment.id,
        message_id=attachment.message_id,
        file_name=attachment.file_name,
        mime_type=attachment.mime_type,
        size=attachment.size,
        uploaded_by_name=uploader_name,
        created_at=attachment.created_at,
    )


def message_read(message: Message, attachments: list[tuple[MessageAttachment, str | None]]) -> MessageRead:
    """Build the wire shape for one message. A deleted message keeps its row
    but its body is blanked here so a leaked payload can't expose it."""
    body = "" if message.deleted_at is not None else message.body
    return MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        sender_kind=message.sender_kind,
        sender_name=message.sender_name,
        message_type=message.message_type,
        body=body,
        attachments=[] if message.deleted_at is not None else [_attachment_read(a, n) for a, n in attachments],
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        created_at=message.created_at,
    )


async def _attachments_by_message(
    db: AsyncSession, message_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[MessageAttachment, str | None]]]:
    if not message_ids:
        return {}
    result = await db.execute(
        select(MessageAttachment, User.full_name)
        .outerjoin(User, User.id == MessageAttachment.uploaded_by_id)
        .where(MessageAttachment.message_id.in_(message_ids))
        .order_by(MessageAttachment.created_at)
    )
    by_message: dict[uuid.UUID, list[tuple[MessageAttachment, str | None]]] = defaultdict(list)
    for attachment, uploader_name in result.all():
        by_message[attachment.message_id].append((attachment, uploader_name))
    return by_message


async def _load_message_read(db: AsyncSession, message: Message) -> MessageRead:
    by_message = await _attachments_by_message(db, [message.id])
    return message_read(message, by_message.get(message.id, []))


# ---- Notifications ------------------------------------------------------


async def _active_participant_user_ids(db: AsyncSession, conversation_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.left_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def _notify(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    event_type: str,
    data: dict,
    *,
    extra_user_ids: list[uuid.UUID] | None = None,
) -> None:
    recipients = await _active_participant_user_ids(db, conversation_id)
    if extra_user_ids:
        recipients = list({*recipients, *extra_user_ids})
    await realtime.manager.send_to_users(
        recipients, {"type": event_type, "conversation_id": str(conversation_id), "data": data}
    )


_MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9_.-]{2,255})")


async def _notify_mentions(db: AsyncSession, conversation: Conversation, message: Message, sender: User) -> None:
    """Store an in-app notification for every active participant @mentioned by
    ``user_name`` in the message body (never the sender). Mentions of people
    who aren't in the conversation are ignored."""
    handles = {m.group(1).lower() for m in _MENTION_RE.finditer(message.body)}
    if not handles:
        return
    participant_ids = await _active_participant_user_ids(db, conversation.id)
    if not participant_ids:
        return
    result = await db.execute(
        select(User.id, User.user_name).where(User.id.in_(participant_ids), func.lower(User.user_name).in_(handles))
    )
    mentioned = [user_id for user_id, _name in result.all()]
    if not mentioned:
        return

    client_name, project_name = await _context_names(db, conversation)
    where = conversation.title or project_name or client_name or "a conversation"
    preview = message.body if len(message.body) <= 140 else f"{message.body[:139]}…"
    await notifications_service.notify_many(
        db,
        user_ids=mentioned,
        category=CATEGORY_MESSAGES,
        event_type=EVENT_MENTION,
        title=f"{sender.full_name} mentioned you",
        body=f"In {where}: “{preview}”",
        link=f"/messages/{conversation.id}",
        agency_id=conversation.agency_id,
        actor=sender,
    )


# ---- Guards -------------------------------------------------------------


async def _client_contact_user_ids(db: AsyncSession, client_id: uuid.UUID) -> list[uuid.UUID]:
    # Imported here (not at module top) to keep the messaging/client_portal
    # module boundary one-directional at import time.
    from binx_api.modules.client_portal.models import ClientContact

    result = await db.execute(select(ClientContact.user_id).where(ClientContact.client_id == client_id))
    return list(result.scalars().all())


async def _require_agency_member(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(AgencyMember.id).where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only agency members can be added to a conversation")


async def get_conversation_for_participant_or_404(
    db: AsyncSession, agency_id: uuid.UUID, conversation_id: uuid.UUID, user: User
) -> tuple[Conversation, ConversationParticipant]:
    """A conversation the caller is an active participant of. 404 (not 403) for
    a non-participant, so a conversation's mere existence isn't revealed."""
    result = await db.execute(
        select(Conversation, ConversationParticipant)
        .join(
            ConversationParticipant,
            and_(
                ConversationParticipant.conversation_id == Conversation.id,
                ConversationParticipant.user_id == user.id,
                ConversationParticipant.left_at.is_(None),
            ),
        )
        .where(Conversation.id == conversation_id, Conversation.agency_id == agency_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return row


async def _validate_context(
    db: AsyncSession, agency_id: uuid.UUID, client_id: uuid.UUID | None, project_id: uuid.UUID | None
) -> None:
    if client_id is not None:
        result = await db.execute(
            select(AgencyClient.id).where(AgencyClient.id == client_id, AgencyClient.agency_id == agency_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if project_id is not None:
        result = await db.execute(select(Project.id).where(Project.id == project_id, Project.agency_id == agency_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")


# ---- Conversations ----------------------------------------------------


def _resolve_title(
    conversation: Conversation, viewer_id: uuid.UUID, participants: list[tuple[ConversationParticipant, User]]
) -> str:
    if conversation.kind == KIND_DIRECT:
        others = [user.full_name for participant, user in participants if participant.user_id != viewer_id]
        return others[0] if others else "Direct message"
    if conversation.title:
        return conversation.title
    others = [user.full_name for participant, user in participants if participant.user_id != viewer_id]
    return ", ".join(others) if others else "Group conversation"


async def _find_existing_direct(
    db: AsyncSession, agency_id: uuid.UUID, user_a: uuid.UUID, user_b: uuid.UUID
) -> Conversation | None:
    """The direct conversation between exactly these two users in this agency,
    if one exists — create_conversation is idempotent for directs."""
    p_a = aliased(ConversationParticipant)
    p_b = aliased(ConversationParticipant)
    result = await db.execute(
        select(Conversation)
        .join(p_a, and_(p_a.conversation_id == Conversation.id, p_a.user_id == user_a, p_a.left_at.is_(None)))
        .join(p_b, and_(p_b.conversation_id == Conversation.id, p_b.user_id == user_b, p_b.left_at.is_(None)))
        .where(Conversation.agency_id == agency_id, Conversation.kind == KIND_DIRECT)
    )
    for conversation in result.scalars():
        count = await db.execute(
            select(func.count())
            .select_from(ConversationParticipant)
            .where(
                ConversationParticipant.conversation_id == conversation.id,
                ConversationParticipant.left_at.is_(None),
            )
        )
        if count.scalar_one() == 2:
            return conversation
    return None


async def create_conversation(
    db: AsyncSession,
    agency: Agency,
    *,
    creator: User,
    kind: str,
    title: str | None,
    participant_user_ids: list[uuid.UUID],
    client_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    initial_message: str | None,
) -> Conversation:
    others = [uid for uid in dict.fromkeys(participant_user_ids) if uid != creator.id]
    for user_id in others:
        await _require_agency_member(db, agency.id, user_id)
    await _validate_context(db, agency.id, client_id, project_id)

    # A client-linked thread always carries that client's portal contacts, so
    # it can stand on its own (creator + client) with no other staff listed.
    contact_user_ids = (
        [uid for uid in await _client_contact_user_ids(db, client_id) if uid != creator.id]
        if client_id is not None
        else []
    )
    if not others and not contact_user_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A conversation needs at least one other person")

    if kind == KIND_DIRECT:
        if len(others) != 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A direct message is between exactly two people")
        existing = await _find_existing_direct(db, agency.id, creator.id, others[0])
        if existing is not None:
            if initial_message:
                await post_message(db, existing, sender=creator, body=initial_message, uploads=[])
            return existing
        title = None

    conversation = Conversation(
        agency_id=agency.id,
        kind=kind,
        title=title if kind == KIND_GROUP else None,
        client_id=client_id,
        project_id=project_id,
        created_by_id=creator.id,
    )
    db.add(conversation)
    await db.flush()

    db.add(ConversationParticipant(conversation_id=conversation.id, user_id=creator.id, added_by_id=creator.id))
    seen = {creator.id}
    for user_id in others:
        db.add(ConversationParticipant(conversation_id=conversation.id, user_id=user_id, added_by_id=creator.id))
        seen.add(user_id)
    # A client-linked thread automatically includes that client's portal
    # contacts, so it shows up in their /portal from the start (they can't be
    # added the normal way — they aren't agency members).
    for contact_user_id in contact_user_ids:
        if contact_user_id not in seen:
            db.add(
                ConversationParticipant(
                    conversation_id=conversation.id, user_id=contact_user_id, added_by_id=creator.id
                )
            )
            seen.add(contact_user_id)
    await db.commit()
    await db.refresh(conversation)

    await _notify(db, conversation.id, realtime.EVENT_CONVERSATION_CREATED, {"created_by": str(creator.id)})

    if initial_message:
        await post_message(db, conversation, sender=creator, body=initial_message, uploads=[])

    return conversation


async def _participants_with_users(
    db: AsyncSession, conversation_id: uuid.UUID, *, include_left: bool = True
) -> list[tuple[ConversationParticipant, User]]:
    query = (
        select(ConversationParticipant, User)
        .join(User, User.id == ConversationParticipant.user_id)
        .where(ConversationParticipant.conversation_id == conversation_id)
        .order_by(ConversationParticipant.created_at)
    )
    if not include_left:
        query = query.where(ConversationParticipant.left_at.is_(None))
    result = await db.execute(query)
    return [(participant, user) for participant, user in result.all()]


async def _unread_count(db: AsyncSession, conversation_id: uuid.UUID, participant: ConversationParticipant) -> int:
    query = (
        select(func.count())
        .select_from(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.message_type == MESSAGE_USER,
            Message.deleted_at.is_(None),
            or_(Message.sender_id != participant.user_id, Message.sender_id.is_(None)),
        )
    )
    if participant.last_read_at is not None:
        query = query.where(Message.created_at > participant.last_read_at)
    result = await db.execute(query)
    return result.scalar_one()


async def _last_message(db: AsyncSession, conversation_id: uuid.UUID) -> Message | None:
    result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


def _preview(message: Message | None) -> str | None:
    if message is None:
        return None
    if message.deleted_at is not None:
        return "Message deleted"
    if message.message_type == MESSAGE_SYSTEM:
        return message.body
    if message.body:
        return message.body
    return "Sent an attachment"


async def _context_names(db: AsyncSession, conversation: Conversation) -> tuple[str | None, str | None]:
    client_name = None
    project_name = None
    if conversation.client_id is not None:
        client = await db.get(AgencyClient, conversation.client_id)
        client_name = client.name if client else None
    if conversation.project_id is not None:
        project = await db.get(Project, conversation.project_id)
        project_name = project.name if project else None
    return client_name, project_name


async def _conversation_summary(
    db: AsyncSession,
    conversation: Conversation,
    user: User,
    my_participant: ConversationParticipant,
    *,
    participants: list[tuple[ConversationParticipant, User]] | None = None,
    context: tuple[str | None, str | None] | None = None,
) -> dict:
    """The inbox-row shape (ConversationRead) for one conversation, as seen by
    ``user``. ``participants`` / ``context`` can be passed in when the caller
    already has them (list view) to avoid re-querying."""
    if participants is None:
        participants = await _participants_with_users(db, conversation.id, include_left=False)
    client_name, project_name = context if context is not None else await _context_names(db, conversation)

    last = await _last_message(db, conversation.id)
    return {
        "id": conversation.id,
        "agency_id": conversation.agency_id,
        "kind": conversation.kind,
        "title": _resolve_title(conversation, user.id, participants),
        "client_id": conversation.client_id,
        "client_name": client_name,
        "project_id": conversation.project_id,
        "project_name": project_name,
        "participant_names": [u.full_name for _p, u in participants if u.id != user.id],
        "participant_count": len(participants),
        "is_muted": my_participant.is_muted,
        "unread_count": await _unread_count(db, conversation.id, my_participant),
        "last_message_preview": _preview(last),
        "last_message_at": conversation.last_message_at,
        "created_at": conversation.created_at,
    }


async def list_conversations(
    db: AsyncSession,
    agency: Agency,
    user: User,
    *,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    query_text: str | None = None,
) -> list[dict]:
    """Every conversation the caller is an active participant of, newest
    activity first, each rolled up into the inbox-row shape (see
    ConversationRead). Optionally filtered to a client/project context or a
    free-text query over title / context / participant names."""
    rows_result = await db.execute(
        select(Conversation, ConversationParticipant, AgencyClient.name, Project.name)
        .join(
            ConversationParticipant,
            and_(
                ConversationParticipant.conversation_id == Conversation.id,
                ConversationParticipant.user_id == user.id,
                ConversationParticipant.left_at.is_(None),
            ),
        )
        .outerjoin(AgencyClient, AgencyClient.id == Conversation.client_id)
        .outerjoin(Project, Project.id == Conversation.project_id)
        .where(Conversation.agency_id == agency.id)
    )
    rows = rows_result.all()

    if client_id is not None:
        rows = [r for r in rows if r[0].client_id == client_id]
    if project_id is not None:
        rows = [r for r in rows if r[0].project_id == project_id]

    conversations: list[dict] = []
    for conversation, my_participant, client_name, project_name in rows:
        participants = await _participants_with_users(db, conversation.id, include_left=False)
        summary = await _conversation_summary(
            db,
            conversation,
            user,
            my_participant,
            participants=participants,
            context=(client_name, project_name),
        )

        if query_text:
            haystack = " ".join(
                [summary["title"], client_name or "", project_name or "", *[u.full_name for _p, u in participants]]
            ).lower()
            if query_text.lower() not in haystack:
                continue

        conversations.append(summary)

    conversations.sort(
        key=lambda c: c["last_message_at"] or c["created_at"],
        reverse=True,
    )
    return conversations


async def get_conversation_detail_or_404(
    db: AsyncSession, agency_id: uuid.UUID, conversation_id: uuid.UUID, user: User
) -> dict:
    """The full ConversationDetailRead shape for a conversation the caller
    participates in (404 otherwise)."""
    conversation, participant = await get_conversation_for_participant_or_404(db, agency_id, conversation_id, user)
    return await conversation_detail(db, conversation, user, participant)


async def conversation_detail(
    db: AsyncSession, conversation: Conversation, user: User, my_participant: ConversationParticipant
) -> dict:
    participants = await _participants_with_users(db, conversation.id, include_left=False)
    summary = await _conversation_summary(db, conversation, user, my_participant, participants=participants)
    avatar_paths = await _avatar_paths(db, [p.user_id for p, _u in participants])
    summary["participants"] = [
        {
            "user_id": p.user_id,
            "full_name": u.full_name,
            "user_name": u.user_name,
            "email": u.email,
            "job_title": u.job_title,
            "has_avatar": p.user_id in avatar_paths,
            "avatar_version": image_version(avatar_paths.get(p.user_id)),
            "is_muted": p.is_muted,
            "last_read_at": p.last_read_at,
            "left_at": p.left_at,
        }
        for p, u in participants
    ]
    return summary


async def _avatar_paths(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """user_id -> avatar storage path, for the users that have one set."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(UserProfile.user_id, UserProfile.avatar_storage_path).where(
            UserProfile.user_id.in_(user_ids), UserProfile.avatar_storage_path.is_not(None)
        )
    )
    return dict(result.all())


async def get_participant_avatar_or_404(
    db: AsyncSession, conversation: Conversation, user_id: uuid.UUID
) -> UserProfile:
    """The profile holding the avatar of someone who is (or was) in the
    conversation — anyone the caller can see messages from. 404 for anyone
    else, so the endpoint can't be used to fetch arbitrary users' photos."""
    result = await db.execute(
        select(UserProfile)
        .join(ConversationParticipant, ConversationParticipant.user_id == UserProfile.user_id)
        .where(
            ConversationParticipant.conversation_id == conversation.id,
            UserProfile.user_id == user_id,
            UserProfile.avatar_storage_path.is_not(None),
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No avatar set")
    return profile


async def unread_total(db: AsyncSession, agency: Agency, user: User) -> int:
    rows = await list_conversations(db, agency, user)
    return sum(c["unread_count"] for c in rows)


# ---- Context / title edits ------------------------------------------------


async def update_conversation(
    db: AsyncSession,
    conversation: Conversation,
    editor: User,
    *,
    title: str | None,
    client_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> Conversation:
    await _validate_context(db, conversation.agency_id, client_id, project_id)

    renamed = conversation.kind == KIND_GROUP and title != conversation.title
    if conversation.kind == KIND_GROUP:
        conversation.title = title
    conversation.client_id = client_id
    conversation.project_id = project_id
    await db.flush()

    if renamed:
        await _add_system_message(
            db,
            conversation,
            f"{editor.full_name} renamed the conversation to “{title}”"
            if title
            else f"{editor.full_name} cleared the conversation name",
        )
    await db.commit()
    await db.refresh(conversation)

    await _notify(
        db,
        conversation.id,
        realtime.EVENT_CONVERSATION_UPDATED,
        {
            "title": conversation.title,
            "client_id": str(conversation.client_id) if conversation.client_id else None,
            "project_id": str(conversation.project_id) if conversation.project_id else None,
        },
    )
    return conversation


# ---- Participants ------------------------------------------------------


async def add_participants(
    db: AsyncSession, conversation: Conversation, actor: User, *, user_ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    if conversation.kind == KIND_DIRECT:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You can't add people to a direct message — start a group instead"
        )

    added: list[uuid.UUID] = []
    for user_id in dict.fromkeys(user_ids):
        await _require_agency_member(db, conversation.agency_id, user_id)
        result = await db.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conversation.id,
                ConversationParticipant.user_id == user_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(ConversationParticipant(conversation_id=conversation.id, user_id=user_id, added_by_id=actor.id))
            added.append(user_id)
        elif existing.left_at is not None:
            existing.left_at = None
            existing.last_read_at = None
            added.append(user_id)

    if not added:
        raise HTTPException(status.HTTP_409_CONFLICT, "Everyone you picked is already in this conversation")

    await db.flush()
    names = await _names_for(db, added)
    await _add_system_message(db, conversation, f"{actor.full_name} added {_join_names(names)}")
    await db.commit()

    await _notify(
        db,
        conversation.id,
        realtime.EVENT_PARTICIPANT_ADDED,
        {"user_ids": [str(u) for u in added]},
        extra_user_ids=added,
    )
    await realtime.manager.send_to_users(
        added, {"type": realtime.EVENT_CONVERSATION_CREATED, "conversation_id": str(conversation.id), "data": {}}
    )
    return added


async def remove_participant(
    db: AsyncSession, conversation: Conversation, actor: User, *, target_user_id: uuid.UUID
) -> None:
    result = await db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation.id,
            ConversationParticipant.user_id == target_user_id,
            ConversationParticipant.left_at.is_(None),
        )
    )
    participant = result.scalar_one_or_none()
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person isn't in this conversation")
    if conversation.kind == KIND_DIRECT:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can't leave a direct message")

    participant.left_at = datetime.now(UTC)
    await db.flush()

    is_self = target_user_id == actor.id
    if is_self:
        text = f"{actor.full_name} left the conversation"
    else:
        names = await _names_for(db, [target_user_id])
        text = f"{actor.full_name} removed {_join_names(names)}"
    await _add_system_message(db, conversation, text)
    await db.commit()

    await _notify(
        db,
        conversation.id,
        realtime.EVENT_PARTICIPANT_REMOVED,
        {"user_ids": [str(target_user_id)]},
        extra_user_ids=[target_user_id],
    )


async def _names_for(db: AsyncSession, user_ids: list[uuid.UUID]) -> list[str]:
    result = await db.execute(select(User.full_name).where(User.id.in_(user_ids)))
    return list(result.scalars().all())


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return names[0] if names else "someone"
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])} and {names[-1]}"


# ---- Read state / settings --------------------------------------------


async def mark_read(db: AsyncSession, conversation: Conversation, participant: ConversationParticipant) -> datetime:
    now = datetime.now(UTC)
    participant.last_read_at = now
    await db.commit()
    await _notify(
        db,
        conversation.id,
        realtime.EVENT_CONVERSATION_READ,
        {"user_id": str(participant.user_id), "last_read_at": now.isoformat()},
    )
    return now


async def set_muted(
    db: AsyncSession, participant: ConversationParticipant, *, is_muted: bool
) -> ConversationParticipant:
    participant.is_muted = is_muted
    await db.commit()
    await db.refresh(participant)
    return participant


# ---- Messages --------------------------------------------------------


async def _add_system_message(db: AsyncSession, conversation: Conversation, text: str) -> Message:
    now = datetime.now(UTC)
    message = Message(
        conversation_id=conversation.id,
        sender_id=None,
        sender_kind=SENDER_USER,
        sender_name="",
        message_type=MESSAGE_SYSTEM,
        body=text,
        # Explicit rather than the DB's CURRENT_TIMESTAMP default: message
        # ordering (and unread math against last_read_at) has to be strictly
        # monotonic, and a server default resolves to the transaction start
        # time, not the statement time.
        created_at=now,
    )
    db.add(message)
    conversation.last_message_at = now
    await db.flush()
    return message


async def list_messages(
    db: AsyncSession, conversation: Conversation, *, limit: int, before: datetime | None
) -> list[MessageRead]:
    query = select(Message).where(Message.conversation_id == conversation.id)
    if before is not None:
        query = query.where(Message.created_at < before)
    query = query.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = list(result.scalars().all())

    by_message = await _attachments_by_message(db, [m.id for m in messages])
    # Return oldest-first for display; the caller paginates backwards via `before`.
    return [message_read(m, by_message.get(m.id, [])) for m in reversed(messages)]


async def post_message(
    db: AsyncSession,
    conversation: Conversation,
    *,
    sender: User,
    body: str,
    uploads: list[tuple[str, bytes, str]],
    sender_kind: str = SENDER_USER,
) -> MessageRead:
    """Post a message as ``sender``. ``uploads`` is a list of
    ``(file_name, content, mime_type)``. Rejects an empty message with no
    files. Bumps the conversation's activity timestamp and pushes
    ``message.created`` to every active participant. ``sender_kind`` is
    ``SENDER_CLIENT`` when the message comes in through the client portal."""
    body = body.strip()
    if not body and not uploads:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A message needs text or an attachment")

    for _name, content, _mime in uploads:
        _validate_attachment(content)

    now = datetime.now(UTC)
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        sender_kind=sender_kind,
        sender_name=sender.full_name,
        message_type=MESSAGE_USER,
        body=body,
        # Explicit — see _add_system_message for why the DB default won't do.
        created_at=now,
    )
    db.add(message)
    await db.flush()

    upload_dir = Path(settings.message_upload_dir) / str(conversation.id)
    for file_name, content, mime_type in uploads:
        stored_path = _write_upload(upload_dir, file_name, content)
        db.add(
            MessageAttachment(
                message_id=message.id,
                uploaded_by_id=sender.id,
                file_name=file_name,
                storage_path=str(stored_path),
                mime_type=mime_type or "application/octet-stream",
                size=len(content),
            )
        )

    conversation.last_message_at = now
    await db.commit()
    await db.refresh(message)

    payload = await _load_message_read(db, message)
    await _notify(db, conversation.id, realtime.EVENT_MESSAGE_CREATED, payload.model_dump(mode="json"))
    if body:
        await _notify_mentions(db, conversation, message, sender)
    return payload


async def get_message_or_404(db: AsyncSession, conversation_id: uuid.UUID, message_id: uuid.UUID) -> Message:
    result = await db.execute(
        select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id)
    )
    message = result.scalar_one_or_none()
    if message is None or message.message_type == MESSAGE_SYSTEM:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return message


async def edit_message(
    db: AsyncSession, conversation: Conversation, message: Message, editor: User, *, body: str
) -> MessageRead:
    if message.sender_id != editor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own messages")
    if message.deleted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    message.body = body.strip()
    message.edited_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)

    payload = await _load_message_read(db, message)
    await _notify(db, conversation.id, realtime.EVENT_MESSAGE_UPDATED, payload.model_dump(mode="json"))
    return payload


async def delete_message(
    db: AsyncSession, conversation: Conversation, message: Message, *, requested_by: User, requester_role: str
) -> None:
    """Soft-delete. The author can delete their own; an agency owner/admin can
    delete anyone's (moderation) — same split as projects' delete_task_comment."""
    is_author = message.sender_id == requested_by.id
    if not is_author and requester_role not in (ROLE_OWNER, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own messages")
    if message.deleted_at is not None:
        return

    result = await db.execute(select(MessageAttachment).where(MessageAttachment.message_id == message.id))
    for attachment in result.scalars():
        _unlink_quietly(attachment.storage_path)
        await db.delete(attachment)

    message.deleted_at = datetime.now(UTC)
    message.body = ""
    await db.commit()

    await _notify(
        db,
        conversation.id,
        realtime.EVENT_MESSAGE_DELETED,
        {"id": str(message.id), "deleted_at": message.deleted_at.isoformat()},
    )


async def get_attachment_or_404(
    db: AsyncSession, conversation_id: uuid.UUID, message_id: uuid.UUID, attachment_id: uuid.UUID
) -> MessageAttachment:
    result = await db.execute(
        select(MessageAttachment)
        .join(Message, Message.id == MessageAttachment.message_id)
        .where(
            MessageAttachment.id == attachment_id,
            MessageAttachment.message_id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return attachment


async def typing_participants(db: AsyncSession, conversation_id: uuid.UUID, user: User) -> list[uuid.UUID] | None:
    """The user ids to relay a `typing` signal to — every active participant
    except the typist — or None if the user isn't a participant."""
    ids = await _active_participant_user_ids(db, conversation_id)
    if user.id not in ids:
        return None
    return [uid for uid in ids if uid != user.id]
