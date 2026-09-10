"""leads: structured AI analysis columns

Splits the single ai_summary blob into structured fields the lead detail page
renders on their own — talking points (JSON list), the suggested next step,
and an at-a-glance fit read. See modules/leads/service.py::analyze_lead.

Revision ID: a1f2c3d4e5b6
Revises: 3df2435d39c7
Create Date: 2026-09-08 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1f2c3d4e5b6"
down_revision: str | Sequence[str] | None = "3df2435d39c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("leads", sa.Column("ai_talking_points", sa.Text(), nullable=True))
    op.add_column("leads", sa.Column("ai_next_step", sa.String(length=1024), nullable=True))
    op.add_column("leads", sa.Column("ai_fit", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "ai_fit")
    op.drop_column("leads", "ai_next_step")
    op.drop_column("leads", "ai_talking_points")
