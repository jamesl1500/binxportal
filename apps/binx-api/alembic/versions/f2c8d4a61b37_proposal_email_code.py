"""proposal email code

A proposal can ask for a code emailed to its recipient before it opens on
the share link.

Revision ID: f2c8d4a61b37
Revises: e5b27c9a4f18
Create Date: 2026-11-26 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2c8d4a61b37"
down_revision: str | Sequence[str] | None = "e5b27c9a4f18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "proposals", sa.Column("require_email_code", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column("proposals", sa.Column("access_code_hash", sa.String(length=64), nullable=True))
    op.add_column("proposals", sa.Column("access_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("proposals", sa.Column("access_code_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "proposals", sa.Column("access_code_attempts", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "proposals", sa.Column("access_code_window_started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "proposals", sa.Column("access_code_window_sends", sa.Integer(), server_default="0", nullable=False)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposals", "access_code_window_sends")
    op.drop_column("proposals", "access_code_window_started_at")
    op.drop_column("proposals", "access_code_attempts")
    op.drop_column("proposals", "access_code_sent_at")
    op.drop_column("proposals", "access_code_expires_at")
    op.drop_column("proposals", "access_code_hash")
    op.drop_column("proposals", "require_email_code")
