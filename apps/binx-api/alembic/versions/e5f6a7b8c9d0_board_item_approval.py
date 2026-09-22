"""board_items client-approval columns

Adds the client-approval workflow to canvas cards (modules/boards/): an
agency member requests/withdraws, a client-portal contact approves or asks
for changes. See boards/models.py's BOARD_APPROVAL_STATUSES.

Revision ID: e5f6a7b8c9d0
Revises: 59d8c24f0a6a
Create Date: 2026-09-22 22:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "59d8c24f0a6a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("board_items", sa.Column("approval_status", sa.String(length=20), nullable=True))
    op.add_column("board_items", sa.Column("approval_requested_by_id", sa.Uuid(), nullable=True))
    op.add_column("board_items", sa.Column("approval_requested_by_name", sa.String(length=255), nullable=True))
    op.add_column("board_items", sa.Column("approval_decided_by_name", sa.String(length=255), nullable=True))
    op.add_column("board_items", sa.Column("approval_decided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("board_items", sa.Column("approval_note", sa.String(length=2000), nullable=True))
    op.create_foreign_key(
        "fk_board_items_approval_requested_by_id_users",
        "board_items",
        "users",
        ["approval_requested_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_board_items_approval_requested_by_id_users", "board_items", type_="foreignkey")
    op.drop_column("board_items", "approval_note")
    op.drop_column("board_items", "approval_decided_at")
    op.drop_column("board_items", "approval_decided_by_name")
    op.drop_column("board_items", "approval_requested_by_name")
    op.drop_column("board_items", "approval_requested_by_id")
    op.drop_column("board_items", "approval_status")
