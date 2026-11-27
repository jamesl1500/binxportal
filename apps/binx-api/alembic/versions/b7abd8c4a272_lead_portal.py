"""lead portal

Lead portals: a branded page shared with a lead (lead_portals: the share
token, on/off, a welcome note) and its question-and-answer thread
(lead_portal_messages). Additive.

Revision ID: b7abd8c4a272
Revises: 43ee583d9fde
Create Date: 2026-11-26 02:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7abd8c4a272"
down_revision: str | Sequence[str] | None = "43ee583d9fde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "lead_portal_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lead_id", sa.Uuid(), nullable=False),
        sa.Column("author_kind", sa.String(length=10), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        sa.Column("author_name", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lead_portal_messages_lead_id"), "lead_portal_messages", ["lead_id"], unique=False)
    op.create_table(
        "lead_portals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lead_id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("welcome_message", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lead_portals_agency_id"), "lead_portals", ["agency_id"], unique=False)
    op.create_index(op.f("ix_lead_portals_lead_id"), "lead_portals", ["lead_id"], unique=True)
    op.create_index(op.f("ix_lead_portals_token"), "lead_portals", ["token"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_lead_portals_token"), table_name="lead_portals")
    op.drop_index(op.f("ix_lead_portals_lead_id"), table_name="lead_portals")
    op.drop_index(op.f("ix_lead_portals_agency_id"), table_name="lead_portals")
    op.drop_table("lead_portals")
    op.drop_index(op.f("ix_lead_portal_messages_lead_id"), table_name="lead_portal_messages")
    op.drop_table("lead_portal_messages")
