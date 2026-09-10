"""invoicing: agency_billing_settings, invoices, invoice_line_items, invoice_payments

Client invoicing. An agency has one ``agency_billing_settings`` row (the
invoice "from" block, currency, numbering scheme, defaults). An ``invoice``
belongs to an agency + client (+ optional project), carries denormalized
subtotal/discount/tax/total in integer cents, and has ``invoice_line_items``
and ``invoice_payments``. Also adds ``billing_email`` / ``billing_address``
to ``agency_clients`` for the invoice "bill to" block.

Revision ID: d4e8a1c6b902
Revises: c1d9f4a2b7e3
Create Date: 2026-08-29 17:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e8a1c6b902"
down_revision: str | Sequence[str] | None = "c1d9f4a2b7e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TIMESTAMP = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("agency_clients", sa.Column("billing_email", sa.String(length=255), nullable=True))
    op.add_column("agency_clients", sa.Column("billing_address", sa.String(length=2048), nullable=True))

    op.create_table(
        "agency_billing_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=True),
        sa.Column("address", sa.String(length=2048), nullable=True),
        sa.Column("tax_id", sa.String(length=64), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("invoice_prefix", sa.String(length=16), nullable=False),
        sa.Column("next_invoice_number", sa.Integer(), nullable=False),
        sa.Column("number_padding", sa.Integer(), nullable=False),
        sa.Column("default_due_days", sa.Integer(), nullable=False),
        sa.Column("default_tax_rate_percent", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("payment_instructions", sa.String(length=2048), nullable=True),
        sa.Column("default_notes", sa.String(length=4096), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_agency_billing_settings_agency_id"),
        "agency_billing_settings",
        ["agency_id"],
        unique=True,
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("discount_amount_cents", sa.Integer(), nullable=True),
        sa.Column("discount_percent", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("tax_rate_percent", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False),
        sa.Column("discount_cents", sa.Integer(), nullable=False),
        sa.Column("tax_cents", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("amount_paid_cents", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(length=4096), nullable=True),
        sa.Column("payment_instructions", sa.String(length=2048), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issued_by_id", sa.Uuid(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["issued_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voided_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agency_id", "number", name="uq_invoices_agency_id_number"),
    )
    op.create_index(op.f("ix_invoices_agency_id"), "invoices", ["agency_id"], unique=False)
    op.create_index(op.f("ix_invoices_client_id"), "invoices", ["client_id"], unique=False)
    op.create_index(op.f("ix_invoices_project_id"), "invoices", ["project_id"], unique=False)

    op.create_table(
        "invoice_line_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=1024), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_invoice_line_items_invoice_id"), "invoice_line_items", ["invoice_id"], unique=False
    )

    op.create_table(
        "invoice_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_by_id", sa.Uuid(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("method", sa.String(length=30), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=_TIMESTAMP, nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_invoice_payments_invoice_id"), "invoice_payments", ["invoice_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_invoice_payments_invoice_id"), table_name="invoice_payments")
    op.drop_table("invoice_payments")

    op.drop_index(op.f("ix_invoice_line_items_invoice_id"), table_name="invoice_line_items")
    op.drop_table("invoice_line_items")

    op.drop_index(op.f("ix_invoices_project_id"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_client_id"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_agency_id"), table_name="invoices")
    op.drop_table("invoices")

    op.drop_index(op.f("ix_agency_billing_settings_agency_id"), table_name="agency_billing_settings")
    op.drop_table("agency_billing_settings")

    op.drop_column("agency_clients", "billing_address")
    op.drop_column("agency_clients", "billing_email")
