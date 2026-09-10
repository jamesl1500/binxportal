"""agency_profiles

One row per agency holding everything beyond its name/slug: branding (logo,
cover, colour, tagline), the about/contact blurb, social links, and the four
named policy blocks. Created lazily on first access.

Revision ID: e7c2f9b41a56
Revises: d4e8a1c6b902
Create Date: 2026-08-30 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7c2f9b41a56"
down_revision: str | Sequence[str] | None = "d4e8a1c6b902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIMESTAMP = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "agency_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("tagline", sa.String(length=255), nullable=True),
        sa.Column("brand_color", sa.String(length=7), nullable=True),
        sa.Column("about", sa.String(length=8192), nullable=True),
        sa.Column("founded_year", sa.Integer(), nullable=True),
        sa.Column("headquarters", sa.String(length=255), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("website", sa.String(length=2048), nullable=True),
        sa.Column("address", sa.String(length=2048), nullable=True),
        sa.Column("linkedin_url", sa.String(length=2048), nullable=True),
        sa.Column("twitter_url", sa.String(length=2048), nullable=True),
        sa.Column("instagram_url", sa.String(length=2048), nullable=True),
        sa.Column("facebook_url", sa.String(length=2048), nullable=True),
        sa.Column("terms_of_service", sa.String(length=16384), nullable=True),
        sa.Column("privacy_policy", sa.String(length=16384), nullable=True),
        sa.Column("working_policy", sa.String(length=16384), nullable=True),
        sa.Column("cancellation_policy", sa.String(length=16384), nullable=True),
        sa.Column("logo_storage_path", sa.String(length=1024), nullable=True),
        sa.Column("logo_mime_type", sa.String(length=255), nullable=True),
        sa.Column("cover_storage_path", sa.String(length=1024), nullable=True),
        sa.Column("cover_mime_type", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agency_profiles_agency_id"), "agency_profiles", ["agency_id"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_agency_profiles_agency_id"), table_name="agency_profiles")
    op.drop_table("agency_profiles")
