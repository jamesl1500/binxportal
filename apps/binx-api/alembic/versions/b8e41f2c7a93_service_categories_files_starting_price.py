"""service categories, files and starting prices

Services can sit in categories, carry photos and PDFs, and have a price
that's where it starts ("From $2,500"). Proposals remember which service
files they've already been given.

Revision ID: b8e41f2c7a93
Revises: a7d3e9b15c62
Create Date: 2026-11-27 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e41f2c7a93"
down_revision: str | Sequence[str] | None = "a7d3e9b15c62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "service_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["agency_id"], ["agencies.id"], name="fk_service_categories_agency_id_agencies", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_service_categories_agency_id"), "service_categories", ["agency_id"], unique=False)

    op.add_column("services", sa.Column("category_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_services_category_id"), "services", ["category_id"], unique=False)
    op.create_foreign_key(
        "fk_services_category_id_service_categories",
        "services",
        "service_categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "services", sa.Column("is_starting_price", sa.Boolean(), server_default="false", nullable=False)
    )

    op.create_table(
        "service_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["service_id"], ["services.id"], name="fk_service_attachments_service_id_services", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_service_attachments_service_id"), "service_attachments", ["service_id"], unique=False)

    op.add_column("proposals", sa.Column("service_files_offered", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposals", "service_files_offered")
    op.drop_index(op.f("ix_service_attachments_service_id"), table_name="service_attachments")
    op.drop_table("service_attachments")
    op.drop_column("services", "is_starting_price")
    op.drop_constraint("fk_services_category_id_service_categories", "services", type_="foreignkey")
    op.drop_index(op.f("ix_services_category_id"), table_name="services")
    op.drop_column("services", "category_id")
    op.drop_index(op.f("ix_service_categories_agency_id"), table_name="service_categories")
    op.drop_table("service_categories")
