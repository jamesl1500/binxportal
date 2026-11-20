"""ai usage microcents + spend index

Tracks each AI call's cost in microcents (1 cent = 1,000,000) so sub-cent
calls count against an agency's monthly budget instead of rounding to zero,
and indexes (agency_id, created_at) for the per-call budget pre-flight.

Revision ID: a9c4e1f27b30
Revises: 56aea590c821
Create Date: 2026-11-19 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9c4e1f27b30"
down_revision: Union[str, Sequence[str], None] = "56aea590c821"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "ai_usage_events",
        sa.Column("cost_microcents", sa.BigInteger(), server_default="0", nullable=False),
    )
    # History keeps its (rounded) whole-cent cost — the exact value was never
    # recorded.
    op.execute("UPDATE ai_usage_events SET cost_microcents = cost_cents::bigint * 1000000")
    op.create_index("ix_ai_usage_events_agency_created", "ai_usage_events", ["agency_id", "created_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_ai_usage_events_agency_created", table_name="ai_usage_events")
    op.drop_column("ai_usage_events", "cost_microcents")
