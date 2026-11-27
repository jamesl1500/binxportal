"""proposal completion claim

What completing a proposal sets off now runs after the signing request
answers, so proposals record who claimed that work and when it finished.
Proposals already complete had it run inline when they were signed, so they
are marked processed (the sweep must never send their signed record again).

Revision ID: d81f3c6a2e94
Revises: c4e9a1d7b350
Create Date: 2026-11-26 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d81f3c6a2e94"
down_revision: str | Sequence[str] | None = "c4e9a1d7b350"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("proposals", sa.Column("completion_claimed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("proposals", sa.Column("completion_processed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE proposals SET completion_processed_at = completed_at, completion_claimed_at = completed_at "
        "WHERE completed_at IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposals", "completion_processed_at")
    op.drop_column("proposals", "completion_claimed_at")
