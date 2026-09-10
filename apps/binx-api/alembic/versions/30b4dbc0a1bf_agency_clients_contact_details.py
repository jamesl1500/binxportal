"""agency_clients: contact details (primary contact, website, notes)

Revision ID: 30b4dbc0a1bf
Revises: 809fc05fe312
Create Date: 2026-08-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '30b4dbc0a1bf'
down_revision: Union[str, Sequence[str], None] = '809fc05fe312'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('agency_clients', sa.Column('primary_contact_name', sa.String(length=255), nullable=True))
    op.add_column('agency_clients', sa.Column('primary_contact_email', sa.String(length=255), nullable=True))
    op.add_column('agency_clients', sa.Column('primary_contact_phone', sa.String(length=32), nullable=True))
    op.add_column('agency_clients', sa.Column('website', sa.String(length=2048), nullable=True))
    op.add_column('agency_clients', sa.Column('notes', sa.String(length=4096), nullable=True))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('agency_clients', 'notes')
    op.drop_column('agency_clients', 'website')
    op.drop_column('agency_clients', 'primary_contact_phone')
    op.drop_column('agency_clients', 'primary_contact_email')
    op.drop_column('agency_clients', 'primary_contact_name')
    # ### end Alembic commands ###
