"""proposal countersign

Lets a proposal require the agency's countersignature after the client's:
``proposals.requires_countersign``, the ``proposal_countersignatures`` record
(same evidence as the client's signature), and ``proposals.completed_at``,
set once every required signature is in. Already-signed proposals are
backfilled as complete.

Revision ID: 36e3a84fccb7
Revises: 27c18fad1f06
Create Date: 2026-11-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "36e3a84fccb7"
down_revision: str | Sequence[str] | None = "27c18fad1f06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "proposal_countersignatures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("signer_name", sa.String(length=255), nullable=False),
        sa.Column("signer_email", sa.String(length=255), nullable=False),
        sa.Column("signature_text", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consent_version", sa.String(length=32), nullable=False),
        sa.Column("consent_text", sa.Text(), nullable=False),
        sa.Column("document_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_proposal_countersignatures_proposal_id"), "proposal_countersignatures", ["proposal_id"], unique=True
    )
    op.add_column("proposals", sa.Column("requires_countersign", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("proposals", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    # Proposals signed before countersigning existed were complete the moment
    # they were signed; without this they'd read as awaiting a countersignature.
    op.execute("UPDATE proposals SET completed_at = decided_at WHERE status = 'signed'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposals", "completed_at")
    op.drop_column("proposals", "requires_countersign")
    op.drop_index(op.f("ix_proposal_countersignatures_proposal_id"), table_name="proposal_countersignatures")
    op.drop_table("proposal_countersignatures")
