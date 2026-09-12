"""client_portal_branding

One row per client holding its own portal branding — colors, logo, and a
custom welcome message — layered over the agency's own AgencyProfile
branding when set. Created lazily on first access, same pattern as
agency_profiles.

Revision ID: 04b389ad29dd
Revises: aa8f8b9bd7c9
Create Date: 2026-09-12 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "04b389ad29dd"
down_revision: str | Sequence[str] | None = "aa8f8b9bd7c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIMESTAMP = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "client_portal_branding",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("primary_color", sa.String(length=7), nullable=True),
        sa.Column("accent_color", sa.String(length=7), nullable=True),
        sa.Column("welcome_message", sa.String(length=500), nullable=True),
        sa.Column("logo_storage_path", sa.String(length=1024), nullable=True),
        sa.Column("logo_mime_type", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_client_portal_branding_client_id"), "client_portal_branding", ["client_id"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_client_portal_branding_client_id"), table_name="client_portal_branding")
    op.drop_table("client_portal_branding")
