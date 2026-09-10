"""projects, project_members, project_task_lists, project_tasks, project_files

Revision ID: f495558d5405
Revises: 30b4dbc0a1bf
Create Date: 2026-08-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f495558d5405'
down_revision: Union[str, Sequence[str], None] = '30b4dbc0a1bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('projects',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('agency_id', sa.Uuid(), nullable=False),
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('description', sa.String(length=4096), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
    # No ondelete on client_id: a client with projects can't be deleted out
    # from under them (agencies/service.py's delete_client catches the
    # resulting IntegrityError and turns it into a friendly message).
    sa.ForeignKeyConstraint(['client_id'], ['agency_clients.id']),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('agency_id', 'slug', name='uq_projects_agency_id_slug')
    )
    op.create_index(op.f('ix_projects_agency_id'), 'projects', ['agency_id'], unique=False)
    op.create_index(op.f('ix_projects_client_id'), 'projects', ['client_id'], unique=False)

    op.create_table('project_members',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('project_id', 'user_id', name='uq_project_members_project_id_user_id')
    )
    op.create_index(op.f('ix_project_members_project_id'), 'project_members', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_members_user_id'), 'project_members', ['user_id'], unique=False)

    op.create_table('project_task_lists',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_task_lists_project_id'), 'project_task_lists', ['project_id'], unique=False)

    op.create_table('project_tasks',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('list_id', sa.Uuid(), nullable=False),
    sa.Column('assignee_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.String(length=4096), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['list_id'], ['project_task_lists.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_tasks_project_id'), 'project_tasks', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_tasks_list_id'), 'project_tasks', ['list_id'], unique=False)

    op.create_table('project_files',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('uploaded_by_id', sa.Uuid(), nullable=True),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('storage_path', sa.String(length=1024), nullable=False),
    sa.Column('mime_type', sa.String(length=255), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_project_files_project_id'), 'project_files', ['project_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_project_files_project_id'), table_name='project_files')
    op.drop_table('project_files')

    op.drop_index(op.f('ix_project_tasks_list_id'), table_name='project_tasks')
    op.drop_index(op.f('ix_project_tasks_project_id'), table_name='project_tasks')
    op.drop_table('project_tasks')

    op.drop_index(op.f('ix_project_task_lists_project_id'), table_name='project_task_lists')
    op.drop_table('project_task_lists')

    op.drop_index(op.f('ix_project_members_user_id'), table_name='project_members')
    op.drop_index(op.f('ix_project_members_project_id'), table_name='project_members')
    op.drop_table('project_members')

    op.drop_index(op.f('ix_projects_client_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_agency_id'), table_name='projects')
    op.drop_table('projects')
    # ### end Alembic commands ###
