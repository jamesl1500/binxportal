"""auth_tokens: new_email column, email_change token purpose

Revision ID: 8f0607081cb0
Revises: 6e83c9b16793
Create Date: 2026-08-26 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f0607081cb0'
down_revision: Union[str, Sequence[str], None] = '6e83c9b16793'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('auth_tokens', sa.Column('new_email', sa.String(length=255), nullable=True))
    # Additive enum value — safe to run inside a transaction on PG 12+, as
    # long as the new value isn't referenced by DML in this same migration.
    op.execute("ALTER TYPE token_purpose ADD VALUE IF NOT EXISTS 'email_change'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('auth_tokens', 'new_email')
    # PostgreSQL has no "DROP VALUE" for enum types, so 'email_change' is left
    # in place on downgrade — a harmless unused enum member.
