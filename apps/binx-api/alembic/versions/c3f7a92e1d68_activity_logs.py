"""activity_logs table

The agency-wide activity/audit feed and each user's personal security
history share this one append-only table (see activity/models.py's
SCOPE_AGENCY / SCOPE_ACCOUNT).

Revision ID: c3f7a92e1d68
Revises: b8d1c05e9a34
Create Date: 2026-09-02 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f7a92e1d68"
down_revision: str | Sequence[str] | None = "b8d1c05e9a34"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=True),
        sa.Column("subject_user_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("target_type", sa.String(length=50), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("target_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_activity_logs_agency_id"), "activity_logs", ["agency_id"], unique=False)
    op.create_index(op.f("ix_activity_logs_subject_user_id"), "activity_logs", ["subject_user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_activity_logs_subject_user_id"), table_name="activity_logs")
    op.drop_index(op.f("ix_activity_logs_agency_id"), table_name="activity_logs")
    op.drop_table("activity_logs")
