"""proposal acceptance

What accepting a completed proposal sets in motion: the per-proposal
settings chosen on the draft (deposit_percent, create_project_on_accept,
kickoff_template_id) and the proposal_acceptances record of what it did
(the client, the portal invitation, the deposit invoice, the project and
kickoff). Additive.

Revision ID: 43ee583d9fde
Revises: 36e3a84fccb7
Create Date: 2026-11-26 01:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "43ee583d9fde"
down_revision: str | Sequence[str] | None = "36e3a84fccb7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "proposal_acceptances",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("blocked_reason", sa.String(length=1024), nullable=True),
        sa.Column("client_id", sa.Uuid(), nullable=True),
        sa.Column("converted_lead", sa.Boolean(), nullable=False),
        sa.Column("invited_email", sa.String(length=255), nullable=True),
        sa.Column("deposit_invoice_id", sa.Uuid(), nullable=True),
        sa.Column("deposit_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("kickoff_id", sa.Uuid(), nullable=True),
        sa.Column("kickoff_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deposit_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["kickoff_id"], ["kickoffs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_proposal_acceptances_client_id"), "proposal_acceptances", ["client_id"], unique=False)
    op.create_index(
        op.f("ix_proposal_acceptances_deposit_invoice_id"), "proposal_acceptances", ["deposit_invoice_id"], unique=False
    )
    op.create_index(op.f("ix_proposal_acceptances_proposal_id"), "proposal_acceptances", ["proposal_id"], unique=True)
    op.add_column("proposals", sa.Column("deposit_percent", sa.Numeric(precision=6, scale=3), nullable=True))
    op.add_column(
        "proposals", sa.Column("create_project_on_accept", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column("proposals", sa.Column("kickoff_template_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_proposals_kickoff_template_id_kickoff_templates"),
        "proposals",
        "kickoff_templates",
        ["kickoff_template_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("fk_proposals_kickoff_template_id_kickoff_templates"), "proposals", type_="foreignkey")
    op.drop_column("proposals", "kickoff_template_id")
    op.drop_column("proposals", "create_project_on_accept")
    op.drop_column("proposals", "deposit_percent")
    op.drop_index(op.f("ix_proposal_acceptances_proposal_id"), table_name="proposal_acceptances")
    op.drop_index(op.f("ix_proposal_acceptances_deposit_invoice_id"), table_name="proposal_acceptances")
    op.drop_index(op.f("ix_proposal_acceptances_client_id"), table_name="proposal_acceptances")
    op.drop_table("proposal_acceptances")
