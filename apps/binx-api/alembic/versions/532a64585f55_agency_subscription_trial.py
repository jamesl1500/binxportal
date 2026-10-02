"""agency_subscription_trial

Adds a card-free trial to agency_subscriptions: the plan being trialed, when
it ends, the deadline for the launch conversion discount, and whether this
agency has ever used its trial. See modules/billing/service.py::start_trial.

Revision ID: c3d4e5f6a7b8
Revises: a7c2e9d4b1f3
Create Date: 2026-10-02 21:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "532a64585f55"
down_revision: str | Sequence[str] | None = "a7c2e9d4b1f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("agency_subscriptions", sa.Column("trial_plan", sa.String(length=20), nullable=True))
    op.add_column("agency_subscriptions", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "agency_subscriptions", sa.Column("trial_discount_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "agency_subscriptions",
        sa.Column("has_used_trial", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("agency_subscriptions", "has_used_trial")
    op.drop_column("agency_subscriptions", "trial_discount_expires_at")
    op.drop_column("agency_subscriptions", "trial_ends_at")
    op.drop_column("agency_subscriptions", "trial_plan")
