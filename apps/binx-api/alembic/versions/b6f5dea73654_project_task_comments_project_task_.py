"""project_task_comments, project_task_files tables

Revision ID: b6f5dea73654
Revises: f495558d5405
Create Date: 2026-08-28 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6f5dea73654'
down_revision: Union[str, Sequence[str], None] = 'f495558d5405'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('project_task_comments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('task_id', sa.Uuid(), nullable=False),
    sa.Column('author_type', sa.String(length=20), nullable=False),
    sa.Column('author_user_id', sa.Uuid(), nullable=True),
    sa.Column('author_name', sa.String(length=255), nullable=False),
    sa.Column('body', sa.String(length=4096), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['author_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['task_id'], ['project_tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_task_comments_task_id'), 'project_task_comments', ['task_id'], unique=False)

    op.create_table('project_task_files',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('task_id', sa.Uuid(), nullable=False),
    sa.Column('uploaded_by_id', sa.Uuid(), nullable=True),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('storage_path', sa.String(length=1024), nullable=False),
    sa.Column('mime_type', sa.String(length=255), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['task_id'], ['project_tasks.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_task_files_task_id'), 'project_task_files', ['task_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_project_task_files_task_id'), table_name='project_task_files')
    op.drop_table('project_task_files')

    op.drop_index(op.f('ix_project_task_comments_task_id'), table_name='project_task_comments')
    op.drop_table('project_task_comments')
    # ### end Alembic commands ###
