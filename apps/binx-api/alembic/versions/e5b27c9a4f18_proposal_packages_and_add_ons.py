"""proposal packages and add-ons

A proposal can offer packages (two to four alternatives the recipient picks
one of) and optional add-on lines they can tick before signing.

Revision ID: e5b27c9a4f18
Revises: d81f3c6a2e94
Create Date: 2026-11-26 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5b27c9a4f18"
down_revision: str | Sequence[str] | None = "d81f3c6a2e94"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "proposal_packages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recommended", sa.Boolean(), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(
            ["proposal_id"], ["proposals.id"], name="fk_proposal_packages_proposal_id_proposals", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_proposal_packages_proposal_id"), "proposal_packages", ["proposal_id"], unique=False)

    op.add_column("proposal_line_items", sa.Column("package_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_proposal_line_items_package_id"), "proposal_line_items", ["package_id"], unique=False)
    op.create_foreign_key(
        "fk_proposal_line_items_package_id_proposal_packages",
        "proposal_line_items",
        "proposal_packages",
        ["package_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("proposal_line_items", sa.Column("optional", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("proposal_line_items", sa.Column("selected", sa.Boolean(), server_default="true", nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("proposal_line_items", "selected")
    op.drop_column("proposal_line_items", "optional")
    op.drop_constraint("fk_proposal_line_items_package_id_proposal_packages", "proposal_line_items", type_="foreignkey")
    op.drop_index(op.f("ix_proposal_line_items_package_id"), table_name="proposal_line_items")
    op.drop_column("proposal_line_items", "package_id")
    op.drop_index(op.f("ix_proposal_packages_proposal_id"), table_name="proposal_packages")
    op.drop_table("proposal_packages")
