"""agencies: agency, agency_member, agency_client tables; drop tenants; user profile columns

Revision ID: 8316825cb751
Revises: e62a23f2c9e8
Create Date: 2026-08-23 18:07:36.236553

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8316825cb751'
down_revision: Union[str, Sequence[str], None] = 'e62a23f2c9e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # tenants was never wired into the app (no router, no dependency use
    # besides its own now-deleted module) — replaced by agencies below.
    op.drop_index(op.f('ix_tenants_slug'), table_name='tenants')
    op.drop_table('tenants')

    op.add_column('users', sa.Column('phone_number', sa.String(length=32), nullable=True))
    op.add_column('users', sa.Column('job_title', sa.String(length=255), nullable=True))

    op.create_table('agencies',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agencies_slug'), 'agencies', ['slug'], unique=True)

    op.create_table('agency_members',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('agency_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.String(length=50), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('agency_id', 'user_id', name='uq_agency_members_agency_id_user_id')
    )
    op.create_index(op.f('ix_agency_members_agency_id'), 'agency_members', ['agency_id'], unique=False)
    op.create_index(op.f('ix_agency_members_user_id'), 'agency_members', ['user_id'], unique=False)

    op.create_table('agency_clients',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('agency_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('agency_id', 'slug', name='uq_agency_clients_agency_id_slug')
    )
    op.create_index(op.f('ix_agency_clients_agency_id'), 'agency_clients', ['agency_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_agency_clients_agency_id'), table_name='agency_clients')
    op.drop_table('agency_clients')

    op.drop_index(op.f('ix_agency_members_user_id'), table_name='agency_members')
    op.drop_index(op.f('ix_agency_members_agency_id'), table_name='agency_members')
    op.drop_table('agency_members')

    op.drop_index(op.f('ix_agencies_slug'), table_name='agencies')
    op.drop_table('agencies')

    op.drop_column('users', 'job_title')
    op.drop_column('users', 'phone_number')

    op.create_table('tenants',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=63), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tenants_slug'), 'tenants', ['slug'], unique=True)
    # ### end Alembic commands ###
