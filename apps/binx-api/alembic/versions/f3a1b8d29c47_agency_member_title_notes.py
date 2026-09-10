"""agency_members.title, agency_members.admin_notes

An agency-specific job title for a member (what they do *here*, distinct from
their personal User.job_title) and internal owner/admin-only notes, both set
from the team page's member drawer.

Revision ID: f3a1b8d29c47
Revises: e7c2f9b41a56
Create Date: 2026-08-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a1b8d29c47"
down_revision: str | Sequence[str] | None = "e7c2f9b41a56"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("agency_members", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column("agency_members", sa.Column("admin_notes", sa.String(length=4096), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("agency_members", "admin_notes")
    op.drop_column("agency_members", "title")
