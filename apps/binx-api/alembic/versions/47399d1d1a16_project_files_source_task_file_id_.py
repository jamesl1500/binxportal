"""project_files.source_task_file_id; mirror task files into project files

Revision ID: 47399d1d1a16
Revises: a97d6a8d096e
Create Date: 2026-08-29 10:22:59.268691

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47399d1d1a16'
down_revision: Union[str, Sequence[str], None] = 'a97d6a8d096e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("project_files", sa.Column("source_task_file_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_project_files_source_task_file_id"), "project_files", ["source_task_file_id"], unique=False
    )
    op.create_foreign_key(
        "fk_project_files_source_task_file_id_project_task_files",
        "project_files",
        "project_task_files",
        ["source_task_file_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Backfill: every existing task attachment gets a project_files mirror
    # pointing at the same bytes, so the project Files table is consistent
    # with the new save_task_file behaviour from the first request after this
    # migration. gen_random_uuid() is built in from PostgreSQL 13.
    op.execute(
        """
        INSERT INTO project_files (
            id, project_id, uploaded_by_id, source_task_file_id,
            file_name, storage_path, mime_type, size, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), pt.project_id, tf.uploaded_by_id, tf.id,
            tf.file_name, tf.storage_path, tf.mime_type, tf.size, tf.created_at, tf.updated_at
        FROM project_task_files AS tf
        JOIN project_tasks AS pt ON pt.id = tf.task_id
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop the mirrors first, then the column they depended on.
    op.execute("DELETE FROM project_files WHERE source_task_file_id IS NOT NULL")
    op.drop_constraint(
        "fk_project_files_source_task_file_id_project_task_files", "project_files", type_="foreignkey"
    )
    op.drop_index(op.f("ix_project_files_source_task_file_id"), table_name="project_files")
    op.drop_column("project_files", "source_task_file_id")
