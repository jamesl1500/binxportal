"""messaging: conversations, conversation_participants, messages, message_attachments

Agency-scoped team messaging. A ``conversation`` (direct or group) has
``conversation_participants`` (each with their own read cursor / mute flag /
soft ``left_at``); ``messages`` belong to a conversation and carry a
snapshotted ``sender_name`` plus soft ``edited_at`` / ``deleted_at``;
``message_attachments`` hold files on local disk, several per message.

Revision ID: c1d9f4a2b7e3
Revises: a8e15b9ef42b
Create Date: 2026-08-29 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d9f4a2b7e3"
down_revision: str | Sequence[str] | None = "a8e15b9ef42b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIMESTAMP = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_conversations_agency_id"), "conversations", ["agency_id"], unique=False)
    op.create_index(op.f("ix_conversations_client_id"), "conversations", ["client_id"], unique=False)
    op.create_index(op.f("ix_conversations_project_id"), "conversations", ["project_id"], unique=False)
    op.create_index(
        op.f("ix_conversations_last_message_at"), "conversations", ["last_message_at"], unique=False
    )

    op.create_table(
        "conversation_participants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("added_by_id", sa.Uuid(), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_muted", sa.Boolean(), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["added_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id", "user_id", name="uq_conversation_participants_conversation_id_user_id"
        ),
    )
    op.create_index(
        op.f("ix_conversation_participants_conversation_id"),
        "conversation_participants",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_conversation_participants_user_id"), "conversation_participants", ["user_id"], unique=False
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=True),
        sa.Column("sender_kind", sa.String(length=20), nullable=False),
        sa.Column("sender_name", sa.String(length=255), nullable=False),
        sa.Column("message_type", sa.String(length=20), nullable=False),
        sa.Column("body", sa.String(length=8192), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_messages_conversation_id"), "messages", ["conversation_id"], unique=False)

    op.create_table(
        "message_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_message_attachments_message_id"), "message_attachments", ["message_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_message_attachments_message_id"), table_name="message_attachments")
    op.drop_table("message_attachments")

    op.drop_index(op.f("ix_messages_conversation_id"), table_name="messages")
    op.drop_table("messages")

    op.drop_index(op.f("ix_conversation_participants_user_id"), table_name="conversation_participants")
    op.drop_index(
        op.f("ix_conversation_participants_conversation_id"), table_name="conversation_participants"
    )
    op.drop_table("conversation_participants")

    op.drop_index(op.f("ix_conversations_last_message_at"), table_name="conversations")
    op.drop_index(op.f("ix_conversations_project_id"), table_name="conversations")
    op.drop_index(op.f("ix_conversations_client_id"), table_name="conversations")
    op.drop_index(op.f("ix_conversations_agency_id"), table_name="conversations")
    op.drop_table("conversations")
