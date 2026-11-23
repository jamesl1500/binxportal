"""agency deletion hold

Deleting an agency now starts a 30-day hold instead of erasing it at once.
These columns record the hold. Additive and nullable (the flag defaults to
false), so every existing agency stays active.

Revision ID: a4c8e2d7f150
Revises: 7b2e4f91c6ad
Create Date: 2026-11-23 15:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4c8e2d7f150"
down_revision: str | Sequence[str] | None = "7b2e4f91c6ad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agencies", sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agencies", sa.Column("deletion_scheduled_for", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agencies", sa.Column("deletion_requested_by_user_id", sa.Uuid(), nullable=True))
    op.add_column(
        "agencies",
        sa.Column("deletion_stopped_renewal", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index(op.f("ix_agencies_deletion_scheduled_for"), "agencies", ["deletion_scheduled_for"])
    op.create_index(op.f("ix_agencies_deletion_requested_by_user_id"), "agencies", ["deletion_requested_by_user_id"])
    op.create_foreign_key(
        op.f("fk_agencies_deletion_requested_by_user_id_users"),
        "agencies",
        "users",
        ["deletion_requested_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_agencies_deletion_requested_by_user_id_users"), "agencies", type_="foreignkey")
    op.drop_index(op.f("ix_agencies_deletion_requested_by_user_id"), table_name="agencies")
    op.drop_index(op.f("ix_agencies_deletion_scheduled_for"), table_name="agencies")
    op.drop_column("agencies", "deletion_stopped_renewal")
    op.drop_column("agencies", "deletion_requested_by_user_id")
    op.drop_column("agencies", "deletion_scheduled_for")
    op.drop_column("agencies", "deletion_requested_at")
