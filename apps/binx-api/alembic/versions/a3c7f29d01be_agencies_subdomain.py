"""agencies.subdomain

Lets a Starter+ agency claim a custom subdomain (e.g. foundryframe for
foundryframe.binxportal.com). Nullable + unique, same pattern as
AgencySubscription.stripe_customer_id — Postgres allows multiple NULLs under
a unique constraint, so agencies without one don't collide.

Revision ID: a3c7f29d01be
Revises: f7a1b4c9d2e3
Create Date: 2026-10-12 22:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c7f29d01be"
down_revision: str | Sequence[str] | None = "f7a1b4c9d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("agencies", sa.Column("subdomain", sa.String(length=63), nullable=True))
    op.create_index(op.f("ix_agencies_subdomain"), "agencies", ["subdomain"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agencies_subdomain"), table_name="agencies")
    op.drop_column("agencies", "subdomain")
