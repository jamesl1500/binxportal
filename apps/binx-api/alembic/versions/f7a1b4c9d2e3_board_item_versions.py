"""board item approval versions

Adds version pinning to the canvas client-approval workflow (modules/boards/):
every approval request now snapshots the card's content + colour into a new
``board_item_versions`` row, so the exact version a client approved stays
viewable even after later edits. ``board_items`` gains ``version_number``
(the most recent snapshot) and ``approved_version_number`` (the last one
actually approved). See boards/models.py's BoardItemVersion.

Revision ID: f7a1b4c9d2e3
Revises: 532a64585f55
Create Date: 2026-10-04 13:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7a1b4c9d2e3"
down_revision: str | Sequence[str] | None = "532a64585f55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("board_items", sa.Column("version_number", sa.Integer(), nullable=True))
    op.add_column("board_items", sa.Column("approved_version_number", sa.Integer(), nullable=True))

    op.create_table(
        "board_item_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_by_id", sa.Uuid(), nullable=True),
        sa.Column("requested_by_name", sa.String(length=255), nullable=True),
        sa.Column("decided_by_name", sa.String(length=255), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["item_id"], ["board_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("item_id", "version_number", name="uq_board_item_versions_item_number"),
    )
    op.create_index(op.f("ix_board_item_versions_item_id"), "board_item_versions", ["item_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_board_item_versions_item_id"), table_name="board_item_versions")
    op.drop_table("board_item_versions")
    op.drop_column("board_items", "approved_version_number")
    op.drop_column("board_items", "version_number")
