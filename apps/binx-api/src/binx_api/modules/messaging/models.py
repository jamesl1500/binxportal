import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Conversation shape
KIND_DIRECT = "direct"
KIND_GROUP = "group"

conversation_kinds: list[str] = [KIND_DIRECT, KIND_GROUP]

# Who wrote a message. "user" (an agency member) is the only kind produced
# today — Binx has no client-facing portal yet. "client" is reserved for
# when it does: that path would leave sender_id null and rely on sender_name,
# the same snapshot every message already carries. Same forward-compat trick
# as projects/models.py's AUTHOR_CLIENT.
SENDER_USER = "user"
SENDER_CLIENT = "client"

# A message is either something a participant typed ("user") or an automatic
# note about the conversation itself ("system" — "Alice added Bob", "Alice
# renamed the group"). System messages have no sender_id.
MESSAGE_USER = "user"
MESSAGE_SYSTEM = "system"


# A conversation between agency members — a 1:1 ("direct") or a named group.
# Scoped to one agency; a member only sees conversations they're a
# participant of (there's no agency-wide visibility, even for owners).
class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)

    kind: Mapped[str] = mapped_column(String(20), default=KIND_GROUP)
    # Group only. A direct conversation's title is derived at read time from
    # whoever the *other* participant is, so it stays correct if they're renamed.
    title: Mapped[str | None] = mapped_column(String(255), default=None)

    # Optional context links. A conversation can be attached to a client or a
    # project so it surfaces on that client's / project's Messages tab.
    # client_id is SET NULL (a deleted client shouldn't take the thread's
    # history with it); project_id is CASCADE (a project's threads are part of
    # the project).
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agency_clients.id", ondelete="SET NULL"), default=None, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), default=None, index=True
    )

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    # Denormalized from the newest message so the inbox can order/scan
    # conversations without a per-row subquery. Null until the first message
    # (which create_conversation always posts if given one).
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, index=True)


# Join table: who is in a conversation. Carries each participant's own
# read cursor and mute preference. Leaving is soft (left_at) so the message
# history a person was part of still reads correctly for everyone else.
class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_participants_conversation_id_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    # Everything created_at-after this is "unread" for this participant.
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set when the person leaves (or is removed). Active participants are the
    # rows where this is null — history stays intact.
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


# A single message. sender_name is snapshotted at write time (like
# ProjectTaskComment.author_name) so history reads correctly after someone
# leaves the agency, and so a future client-authored message — which has no
# User row to join to — works the same way. Edits/deletes are soft: a deleted
# message becomes a "message deleted" placeholder rather than vanishing.
class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)

    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    sender_kind: Mapped[str] = mapped_column(String(20), default=SENDER_USER)
    sender_name: Mapped[str] = mapped_column(String(255))

    message_type: Mapped[str] = mapped_column(String(20), default=MESSAGE_USER)
    body: Mapped[str] = mapped_column(String(8192), default="")

    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


# A file attached to a message. Same local-disk storage approach as
# ProjectTaskFile (see messaging/service.py) — only path/size/mime are
# tracked here, so swapping to object storage later doesn't touch this shape.
# A message can carry several.
class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    file_name: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(1024))
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer)
