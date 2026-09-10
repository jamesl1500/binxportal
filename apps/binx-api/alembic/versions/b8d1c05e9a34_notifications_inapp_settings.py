"""notifications table + in-app notification toggles

Adds the ``notifications`` table (one row per recipient per event) and four
``inapp_*`` mute toggles on ``user_notification_settings`` — one per
notification category (team / invoicing / projects / messages).

Revision ID: b8d1c05e9a34
Revises: f3a1b8d29c47
Create Date: 2026-09-01 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8d1c05e9a34"
down_revision: str | Sequence[str] | None = "f3a1b8d29c47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INAPP_COLUMNS = ("inapp_team", "inapp_invoicing", "inapp_projects", "inapp_messages")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.String(length=1024), nullable=True),
        sa.Column("link", sa.String(length=512), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)
    op.create_index(op.f("ix_notifications_agency_id"), "notifications", ["agency_id"], unique=False)

    for column in _INAPP_COLUMNS:
        op.add_column(
            "user_notification_settings",
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    for column in _INAPP_COLUMNS:
        op.alter_column("user_notification_settings", column, server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    for column in _INAPP_COLUMNS:
        op.drop_column("user_notification_settings", column)

    op.drop_index(op.f("ix_notifications_agency_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_table("notifications")
