"""ai_user_preferences + ai_actions

Backs the "Ask AI" assistant's two new abilities: per-member preferences
(the modal's settings dropdown — answer length, tone, whether the assistant
may make changes and whether each needs approval, voice auto-send, custom
instructions), and the changes it makes or proposes on a member's behalf
(the Approve/Decline queue + audit trail).

Revision ID: 4f04054d39cf
Revises: a7c2e9d4b1f3
Create Date: 2026-10-01 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4f04054d39cf"
down_revision: str | Sequence[str] | None = "a7c2e9d4b1f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ai_user_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("response_length", sa.String(length=20), nullable=False),
        sa.Column("tone", sa.String(length=20), nullable=False),
        sa.Column("allow_actions", sa.Boolean(), nullable=False),
        sa.Column("confirm_actions", sa.Boolean(), nullable=False),
        sa.Column("voice_auto_send", sa.Boolean(), nullable=False),
        sa.Column("custom_instructions", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agency_id", "user_id", name="uq_ai_user_preferences_agency_user"),
    )
    op.create_index(op.f("ix_ai_user_preferences_agency_id"), "ai_user_preferences", ["agency_id"], unique=False)
    op.create_index(op.f("ix_ai_user_preferences_user_id"), "ai_user_preferences", ["user_id"], unique=False)

    op.create_table(
        "ai_actions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("tool", sa.String(length=50), nullable=False),
        sa.Column("input", sa.Text(), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("result", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["ai_conversation_messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_actions_conversation_id"), "ai_actions", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_ai_actions_message_id"), "ai_actions", ["message_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_ai_actions_message_id"), table_name="ai_actions")
    op.drop_index(op.f("ix_ai_actions_conversation_id"), table_name="ai_actions")
    op.drop_table("ai_actions")
    op.drop_index(op.f("ix_ai_user_preferences_user_id"), table_name="ai_user_preferences")
    op.drop_index(op.f("ix_ai_user_preferences_agency_id"), table_name="ai_user_preferences")
    op.drop_table("ai_user_preferences")
