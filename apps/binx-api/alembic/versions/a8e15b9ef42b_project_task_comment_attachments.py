"""project_task_comments.attachment -> project_task_files

A task comment can carry (at most) one file. That file is just a normal task
file: it lives in ``project_task_files`` (and is therefore mirrored into
``project_files`` like every other task attachment — see
``ProjectFile.source_task_file_id``), and ``project_task_comments.attachment``
points at it.

ON DELETE SET NULL: deleting the task file (or its task) only clears the
comment's pointer, never the comment. The service deletes the task file when
the comment is deleted, which cascades the ``project_files`` mirror away and
unlinks the bytes.

Revision ID: a8e15b9ef42b
Revises: 47399d1d1a16
Create Date: 2026-08-29 12:29:46.134601

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8e15b9ef42b"
down_revision: str | Sequence[str] | None = "47399d1d1a16"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("project_task_comments", sa.Column("attachment", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_project_task_comments_attachment"), "project_task_comments", ["attachment"], unique=False
    )
    op.create_foreign_key(
        "fk_task_comments_attachment",
        "project_task_comments",
        "project_task_files",
        ["attachment"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_task_comments_attachment", "project_task_comments", type_="foreignkey")
    op.drop_index(op.f("ix_project_task_comments_attachment"), table_name="project_task_comments")
    op.drop_column("project_task_comments", "attachment")
