"""proposal monthly lines

Proposal lines get a billing kind (one_time | monthly; existing lines are
one-time), proposals get per-month totals for their monthly lines, and an
acceptance records the recurring schedule that bills them. Additive.

Revision ID: c4e9a1d7b350
Revises: b7abd8c4a272
Create Date: 2026-11-26 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e9a1d7b350"
down_revision: str | Sequence[str] | None = "b7abd8c4a272"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "proposal_line_items",
        sa.Column("billing", sa.String(length=20), server_default="one_time", nullable=False),
    )
    for column in ("monthly_subtotal_cents", "monthly_tax_cents", "monthly_total_cents"):
        op.add_column("proposals", sa.Column(column, sa.Integer(), server_default="0", nullable=False))
    op.add_column("proposal_acceptances", sa.Column("retainer_schedule_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_proposal_acceptances_retainer_schedule_id",
        "proposal_acceptances",
        "recurring_invoice_schedules",
        ["retainer_schedule_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_proposal_acceptances_retainer_schedule_id", "proposal_acceptances", type_="foreignkey")
    op.drop_column("proposal_acceptances", "retainer_schedule_id")
    for column in ("monthly_total_cents", "monthly_tax_cents", "monthly_subtotal_cents"):
        op.drop_column("proposals", column)
    op.drop_column("proposal_line_items", "billing")
