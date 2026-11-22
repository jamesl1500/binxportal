"""invoice payment fees

Records the fees taken from an online (Stripe) invoice payment: Binx's
platform fee and Stripe's processing fee. Both are nullable — payments
recorded by hand carry no fees, and payments made before this migration
predate the platform fee.

Revision ID: c41e9a7d2b58
Revises: 046934a8bb07
Create Date: 2026-11-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41e9a7d2b58'
down_revision: Union[str, Sequence[str], None] = '046934a8bb07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('invoice_payments', sa.Column('platform_fee_cents', sa.Integer(), nullable=True))
    op.add_column('invoice_payments', sa.Column('stripe_fee_cents', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('invoice_payments', 'stripe_fee_cents')
    op.drop_column('invoice_payments', 'platform_fee_cents')
