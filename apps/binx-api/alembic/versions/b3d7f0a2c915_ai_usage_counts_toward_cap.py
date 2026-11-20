"""ai usage counts_toward_cap

Marks which AI calls count toward a member's daily request cap, so an Ask AI
question counts once however many tool steps it takes.

Revision ID: b3d7f0a2c915
Revises: a9c4e1f27b30
Create Date: 2026-11-19 20:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3d7f0a2c915"
down_revision: Union[str, Sequence[str], None] = "a9c4e1f27b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "ai_usage_events",
        sa.Column("counts_toward_cap", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("ai_usage_events", "counts_toward_cap")
