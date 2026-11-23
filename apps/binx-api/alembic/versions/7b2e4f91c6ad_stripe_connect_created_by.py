"""stripe connect created by

Records who created each agency's Stripe Connect account, and when. Additive
and nullable: existing accounts keep working and read as "creator unknown",
because nothing recorded who started them.

Revision ID: 7b2e4f91c6ad
Revises: 0dc0cedc4ca7
Create Date: 2026-11-23 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b2e4f91c6ad"
down_revision: str | Sequence[str] | None = "0dc0cedc4ca7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("agency_billing_settings", sa.Column("stripe_connect_created_by_user_id", sa.Uuid(), nullable=True))
    op.add_column(
        "agency_billing_settings", sa.Column("stripe_connect_created_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        op.f("ix_agency_billing_settings_stripe_connect_created_by_user_id"),
        "agency_billing_settings",
        ["stripe_connect_created_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_agency_billing_settings_stripe_connect_created_by_user_id_users"),
        "agency_billing_settings",
        "users",
        ["stripe_connect_created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("fk_agency_billing_settings_stripe_connect_created_by_user_id_users"),
        "agency_billing_settings",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_agency_billing_settings_stripe_connect_created_by_user_id"), table_name="agency_billing_settings"
    )
    op.drop_column("agency_billing_settings", "stripe_connect_created_at")
    op.drop_column("agency_billing_settings", "stripe_connect_created_by_user_id")
