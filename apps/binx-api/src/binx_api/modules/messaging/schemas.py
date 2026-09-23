import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class MessageAttachmentRead(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    file_name: str
    mime_type: str
    size: int
    uploaded_by_name: str | None
    created_at: datetime


class MessageRead(BaseModel):
    # Built by hand — sender_name is snapshotted on the row, attachments come
    # from a separate query. A deleted message is still returned (message_type
    # / deleted_at let the client render a "message deleted" placeholder) so
    # positions and reply context stay stable.
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID | None
    sender_kind: str
    sender_name: str
    message_type: str
    body: str
    attachments: list[MessageAttachmentRead]
    edited_at: datetime | None
    deleted_at: datetime | None
    created_at: datetime


class ParticipantRead(BaseModel):
    user_id: uuid.UUID
    full_name: str
    # The @handle used to mention this person in a message body.
    user_name: str
    email: str
    job_title: str | None
    # Photo flags, same convention as AgencyMemberRead — storage paths are
    # never exposed. Staff fetch the bytes through the agency member route;
    # client contacts through GET /portal/conversations/{id}/participants/
    # {user_id}/avatar (proxied).
    has_avatar: bool = False
    avatar_version: str | None = None
    is_muted: bool
    last_read_at: datetime | None
    left_at: datetime | None


class ConversationRead(BaseModel):
    # The inbox-row shape. title is resolved (the other person's name for a
    # direct conversation), last_message_* / unread_count are denormalized for
    # the list, participant_names is a short summary for the avatar stack.
    id: uuid.UUID
    agency_id: uuid.UUID
    kind: str
    title: str
    client_id: uuid.UUID | None
    client_name: str | None
    project_id: uuid.UUID | None
    project_name: str | None
    participant_names: list[str]
    participant_count: int
    is_muted: bool
    unread_count: int
    last_message_preview: str | None
    last_message_at: datetime | None
    created_at: datetime


class ConversationDetailRead(ConversationRead):
    participants: list[ParticipantRead]


class ConversationCreate(BaseModel):
    kind: str = Field(pattern="^(direct|group)$")
    # Group only; ignored for a direct conversation (its title is derived).
    title: str | None = Field(default=None, max_length=255)
    # Everyone other than the caller. A direct conversation needs exactly one;
    # a group needs at least one — unless it's client-linked, in which case
    # the client's portal contacts fill it (see create_conversation).
    participant_user_ids: list[uuid.UUID] = Field(default_factory=list)
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    # An optional first message, posted as the caller in the same request.
    initial_message: str | None = Field(default=None, max_length=8192)


class ConversationUpdate(BaseModel):
    # A full replace of the editable context. title only applies to a group.
    # Pass client_id/project_id as null to detach.
    title: str | None = Field(default=None, max_length=255)
    client_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


class ParticipantAdd(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1)


class ConversationSettingsUpdate(BaseModel):
    is_muted: bool


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=8192)


# The message-create endpoint takes multipart/form-data (body field + repeated
# file fields), not JSON, so its constraints live on the Form()/File() in the
# router — there's no request-body model for it, same as task comments.


class UnreadSummaryRead(BaseModel):
    """Total unread messages across all the caller's conversations in an
    agency — what the top-nav badge shows."""

    unread_total: int
