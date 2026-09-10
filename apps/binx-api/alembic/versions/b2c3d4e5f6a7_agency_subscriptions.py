"""agency_subscriptions

Backs modules/billing/: one lazily-created row per agency naming its plan.
The plan's limits themselves live in code (billing/models.py::PLANS) and are
enforced at the _check_can_create_* seams and the AI budget check.

Revision ID: b2c3d4e5f6a7
Revises: a1f2c3d4e5b6
Create Date: 2026-09-08 09:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1f2c3d4e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agency_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("plan", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agency_id"),
    )
    op.create_index(
        op.f("ix_agency_subscriptions_agency_id"), "agency_subscriptions", ["agency_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_agency_subscriptions_agency_id"), table_name="agency_subscriptions")
    op.drop_table("agency_subscriptions")
