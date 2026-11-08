"""milanote-style canvas: nested boards, columns, linked to-do tasks

- ``project_boards`` becomes a tree: ``parent_id`` (CASCADE) + ``title``. The
  old unique index on ``project_id`` is replaced by a non-unique one plus a
  partial unique index so each project still has exactly one *root* board.
- ``board_items`` gains ``parent_id`` (column membership, SET NULL) and
  ``position`` (order within the column).
- ``project_tasks`` gains ``board_item_id`` (the canvas to-do card it's a row
  of, SET NULL) and ``todo_position``.

New card kinds (todo/link/file/column/board/line) are plain ``type`` strings
with JSON ``content`` — no schema change needed for those.

Revision ID: b8d2e4f6a1c3
Revises: a3c7f29d01be
Create Date: 2026-11-08 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8d2e4f6a1c3"
down_revision: str | Sequence[str] | None = "a3c7f29d01be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project_boards", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.add_column("project_boards", sa.Column("title", sa.String(length=120), nullable=True))
    op.create_foreign_key(
        "fk_project_boards_parent_id", "project_boards", "project_boards", ["parent_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index(op.f("ix_project_boards_parent_id"), "project_boards", ["parent_id"], unique=False)
    op.drop_index(op.f("ix_project_boards_project_id"), table_name="project_boards")
    op.create_index(op.f("ix_project_boards_project_id"), "project_boards", ["project_id"], unique=False)
    op.create_index(
        "uq_project_boards_root",
        "project_boards",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("parent_id IS NULL"),
    )

    op.add_column("board_items", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.add_column("board_items", sa.Column("position", sa.Integer(), server_default="0", nullable=False))
    op.create_foreign_key(
        "fk_board_items_parent_id", "board_items", "board_items", ["parent_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_board_items_parent_id"), "board_items", ["parent_id"], unique=False)

    op.add_column("project_tasks", sa.Column("board_item_id", sa.Uuid(), nullable=True))
    op.add_column("project_tasks", sa.Column("todo_position", sa.Integer(), server_default="0", nullable=False))
    op.create_foreign_key(
        "fk_project_tasks_board_item_id", "project_tasks", "board_items", ["board_item_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_project_tasks_board_item_id"), "project_tasks", ["board_item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_project_tasks_board_item_id"), table_name="project_tasks")
    op.drop_constraint("fk_project_tasks_board_item_id", "project_tasks", type_="foreignkey")
    op.drop_column("project_tasks", "todo_position")
    op.drop_column("project_tasks", "board_item_id")

    op.drop_index(op.f("ix_board_items_parent_id"), table_name="board_items")
    op.drop_constraint("fk_board_items_parent_id", "board_items", type_="foreignkey")
    op.drop_column("board_items", "position")
    op.drop_column("board_items", "parent_id")

    # Nested boards can't survive a single-board-per-project schema.
    op.execute("DELETE FROM project_boards WHERE parent_id IS NOT NULL")
    op.drop_index("uq_project_boards_root", table_name="project_boards")
    op.drop_index(op.f("ix_project_boards_project_id"), table_name="project_boards")
    op.create_index(op.f("ix_project_boards_project_id"), "project_boards", ["project_id"], unique=True)
    op.drop_index(op.f("ix_project_boards_parent_id"), table_name="project_boards")
    op.drop_constraint("fk_project_boards_parent_id", "project_boards", type_="foreignkey")
    op.drop_column("project_boards", "title")
    op.drop_column("project_boards", "parent_id")
