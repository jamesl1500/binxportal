"""services catalog and proposal attachments

Adds the agency services catalog (``services``), documents attached to a
proposal (``proposal_attachments``), and an optional ``service_id`` on the
proposal / invoice / recurring line items made from a service. Proposal lines
also gain ``details``, the longer copy shown under a line. All additive and
nullable, so existing documents are untouched.

Revision ID: 070d1ce7e5c3
Revises: a4c8e2d7f150
Create Date: 2026-11-25 14:40:31.643352

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "070d1ce7e5c3"
down_revision: str | Sequence[str] | None = "a4c8e2d7f150"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LINE_TABLES = ("invoice_line_items", "proposal_line_items", "recurring_invoice_line_items")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "services",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("pricing_type", sa.String(length=20), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("default_quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_services_agency_id"), "services", ["agency_id"], unique=False)

    op.create_table(
        "proposal_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_proposal_attachments_proposal_id"), "proposal_attachments", ["proposal_id"], unique=False)

    op.add_column("proposal_line_items", sa.Column("details", sa.Text(), nullable=True))
    for table in _LINE_TABLES:
        op.add_column(table, sa.Column("service_id", sa.Uuid(), nullable=True))
        op.create_index(op.f(f"ix_{table}_service_id"), table, ["service_id"], unique=False)
        op.create_foreign_key(
            op.f(f"fk_{table}_service_id_services"), table, "services", ["service_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    """Downgrade schema."""
    for table in _LINE_TABLES:
        op.drop_constraint(op.f(f"fk_{table}_service_id_services"), table, type_="foreignkey")
        op.drop_index(op.f(f"ix_{table}_service_id"), table_name=table)
        op.drop_column(table, "service_id")
    op.drop_column("proposal_line_items", "details")

    op.drop_index(op.f("ix_proposal_attachments_proposal_id"), table_name="proposal_attachments")
    op.drop_table("proposal_attachments")
    op.drop_index(op.f("ix_services_agency_id"), table_name="services")
    op.drop_table("services")
