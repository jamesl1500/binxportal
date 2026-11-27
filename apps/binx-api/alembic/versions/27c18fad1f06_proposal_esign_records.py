"""proposal esign records

What a binding e-signature rests on: a frozen snapshot of each sent proposal
and its SHA-256 (proposals.document_snapshot / document_hash), the evidence
on each signature (browser, how it was signed, the consent wording accepted,
the fingerprint signed), and an audit trail of what happened to a proposal
(proposal_events). Additive and nullable; proposals sent earlier get their
snapshot the first time they're opened.

Revision ID: 27c18fad1f06
Revises: 070d1ce7e5c3
Create Date: 2026-11-25 16:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "27c18fad1f06"
down_revision: str | Sequence[str] | None = "070d1ce7e5c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "proposal_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("actor_label", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("detail", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proposal_id"], ["proposals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_proposal_events_proposal_id"), "proposal_events", ["proposal_id"], unique=False)
    op.add_column("proposal_signatures", sa.Column("user_agent", sa.String(length=512), nullable=True))
    op.add_column("proposal_signatures", sa.Column("signed_via", sa.String(length=20), nullable=True))
    op.add_column("proposal_signatures", sa.Column("consent_version", sa.String(length=32), nullable=True))
    op.add_column("proposal_signatures", sa.Column("consent_text", sa.Text(), nullable=True))
    op.add_column("proposal_signatures", sa.Column("document_hash", sa.String(length=64), nullable=True))
    op.add_column("proposals", sa.Column("document_snapshot", sa.Text(), nullable=True))
    op.add_column("proposals", sa.Column("document_hash", sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposals", "document_hash")
    op.drop_column("proposals", "document_snapshot")
    op.drop_column("proposal_signatures", "document_hash")
    op.drop_column("proposal_signatures", "consent_text")
    op.drop_column("proposal_signatures", "consent_version")
    op.drop_column("proposal_signatures", "signed_via")
    op.drop_column("proposal_signatures", "user_agent")
    op.drop_index(op.f("ix_proposal_events_proposal_id"), table_name="proposal_events")
    op.drop_table("proposal_events")
