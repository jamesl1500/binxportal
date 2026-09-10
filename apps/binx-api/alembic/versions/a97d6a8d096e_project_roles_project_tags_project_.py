"""project_roles, project_tags, project_task_tag_links tables; project_members.role_id

Revision ID: a97d6a8d096e
Revises: b6f5dea73654
Create Date: 2026-08-28 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a97d6a8d096e'
down_revision: Union[str, Sequence[str], None] = 'b6f5dea73654'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('project_roles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('project_id', 'name', name='uq_project_roles_project_id_name')
    )
    op.create_index(op.f('ix_project_roles_project_id'), 'project_roles', ['project_id'], unique=False)

    op.create_table('project_tags',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('project_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('color', sa.String(length=7), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('project_id', 'name', name='uq_project_tags_project_id_name')
    )
    op.create_index(op.f('ix_project_tags_project_id'), 'project_tags', ['project_id'], unique=False)

    op.create_table('project_task_tag_links',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('task_id', sa.Uuid(), nullable=False),
    sa.Column('tag_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['tag_id'], ['project_tags.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['task_id'], ['project_tasks.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('task_id', 'tag_id', name='uq_project_task_tag_links_task_id_tag_id')
    )
    op.create_index(op.f('ix_project_task_tag_links_task_id'), 'project_task_tag_links', ['task_id'], unique=False)
    op.create_index(op.f('ix_project_task_tag_links_tag_id'), 'project_task_tag_links', ['tag_id'], unique=False)

    op.add_column('project_members', sa.Column('role_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_project_members_role_id_project_roles', 'project_members', 'project_roles', ['role_id'], ['id'], ondelete='SET NULL'
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_project_members_role_id_project_roles', 'project_members', type_='foreignkey')
    op.drop_column('project_members', 'role_id')

    op.drop_index(op.f('ix_project_task_tag_links_tag_id'), table_name='project_task_tag_links')
    op.drop_index(op.f('ix_project_task_tag_links_task_id'), table_name='project_task_tag_links')
    op.drop_table('project_task_tag_links')

    op.drop_index(op.f('ix_project_tags_project_id'), table_name='project_tags')
    op.drop_table('project_tags')

    op.drop_index(op.f('ix_project_roles_project_id'), table_name='project_roles')
    op.drop_table('project_roles')
    # ### end Alembic commands ###
