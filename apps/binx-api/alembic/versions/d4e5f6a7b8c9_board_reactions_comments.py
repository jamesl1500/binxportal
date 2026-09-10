"""board_item_reactions + board_item_comments

Emoji reactions and text comments on collaboration-canvas cards
(modules/boards/). Reactions toggle one row per (item, user, kind); comments
are shaped like ProjectTaskComment minus the attachment.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-09 09:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "board_item_reactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["item_id"], ["board_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", "user_id", "kind", name="uq_board_item_reactions_item_user_kind"),
    )
    op.create_index(op.f("ix_board_item_reactions_item_id"), "board_item_reactions", ["item_id"], unique=False)
    op.create_index(op.f("ix_board_item_reactions_user_id"), "board_item_reactions", ["user_id"], unique=False)

    op.create_table(
        "board_item_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("author_kind", sa.String(length=10), nullable=False),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        sa.Column("author_name", sa.String(length=255), nullable=False),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["item_id"], ["board_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_board_item_comments_item_id"), "board_item_comments", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_board_item_comments_item_id"), table_name="board_item_comments")
    op.drop_table("board_item_comments")
    op.drop_index(op.f("ix_board_item_reactions_user_id"), table_name="board_item_reactions")
    op.drop_index(op.f("ix_board_item_reactions_item_id"), table_name="board_item_reactions")
    op.drop_table("board_item_reactions")
