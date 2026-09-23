"""lead_search_criteria table

A staff-configured, reusable prospecting search — the AI prospector's
"saved search". See modules/leads/models.py::LeadSearchCriteria.

Revision ID: c9d3f5a1e246
Revises: f1a2b3c4d5e6
Create Date: 2026-09-23 21:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d3f5a1e246"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lead_search_criteria",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("industry", sa.String(length=200), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("radius_miles", sa.Integer(), nullable=True),
        sa.Column("company_size", sa.String(length=100), nullable=True),
        sa.Column("keywords", sa.String(length=500), nullable=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_result_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lead_search_criteria_agency_id"), "lead_search_criteria", ["agency_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lead_search_criteria_agency_id"), table_name="lead_search_criteria")
    op.drop_table("lead_search_criteria")
