"""agency_invitations table

Revision ID: 809fc05fe312
Revises: 8f0607081cb0
Create Date: 2026-08-28 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '809fc05fe312'
down_revision: Union[str, Sequence[str], None] = '8f0607081cb0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('agency_invitations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('agency_id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=50), nullable=False),
    sa.Column('invited_by_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['invited_by_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_agency_invitations_agency_id'), 'agency_invitations', ['agency_id'], unique=False)
    op.create_index(op.f('ix_agency_invitations_email'), 'agency_invitations', ['email'], unique=False)
    op.create_index(op.f('ix_agency_invitations_token_hash'), 'agency_invitations', ['token_hash'], unique=True)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_agency_invitations_token_hash'), table_name='agency_invitations')
    op.drop_index(op.f('ix_agency_invitations_email'), table_name='agency_invitations')
    op.drop_index(op.f('ix_agency_invitations_agency_id'), table_name='agency_invitations')
    op.drop_table('agency_invitations')
    # ### end Alembic commands ###
