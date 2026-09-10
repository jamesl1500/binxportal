"""agency_ai_settings + ai_usage_events + ai_conversations + ai_conversation_messages

Backs modules/ai/: per-agency AI settings (monthly budget, daily per-user
cap), the usage/audit log every Claude call writes to (ok/error/blocked),
and the "Ask AI" assistant's chat threads.

Revision ID: 3df2435d39c7
Revises: b7d3e21f9a08
Create Date: 2026-09-04 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3df2435d39c7"
down_revision: str | Sequence[str] | None = "b7d3e21f9a08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "agency_ai_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("monthly_budget_cents", sa.Integer(), nullable=False),
        sa.Column("daily_user_request_cap", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agency_id"),
    )
    op.create_index(op.f("ix_agency_ai_settings_agency_id"), "agency_ai_settings", ["agency_id"], unique=True)

    op.create_table(
        "ai_usage_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("feature", sa.String(length=30), nullable=False),
        sa.Column("model", sa.String(length=50), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("error_message", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_usage_events_agency_id"), "ai_usage_events", ["agency_id"], unique=False)
    op.create_index(op.f("ix_ai_usage_events_user_id"), "ai_usage_events", ["user_id"], unique=False)

    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_conversations_agency_id"), "ai_conversations", ["agency_id"], unique=False)
    op.create_index(op.f("ix_ai_conversations_user_id"), "ai_conversations", ["user_id"], unique=False)

    op.create_table(
        "ai_conversation_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("content", sa.String(length=8192), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ai_conversation_messages_conversation_id"), "ai_conversation_messages", ["conversation_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_ai_conversation_messages_conversation_id"), table_name="ai_conversation_messages")
    op.drop_table("ai_conversation_messages")
    op.drop_index(op.f("ix_ai_conversations_user_id"), table_name="ai_conversations")
    op.drop_index(op.f("ix_ai_conversations_agency_id"), table_name="ai_conversations")
    op.drop_table("ai_conversations")
    op.drop_index(op.f("ix_ai_usage_events_user_id"), table_name="ai_usage_events")
    op.drop_index(op.f("ix_ai_usage_events_agency_id"), table_name="ai_usage_events")
    op.drop_table("ai_usage_events")
    op.drop_index(op.f("ix_agency_ai_settings_agency_id"), table_name="agency_ai_settings")
    op.drop_table("agency_ai_settings")
