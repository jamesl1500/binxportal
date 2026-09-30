"""project_dashboard_layout: per-user layout for the /projects/{id} dashboard

Revision ID: a7c2e9d4b1f3
Revises: 07a5cf5d5bed
Create Date: 2026-09-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c2e9d4b1f3'
down_revision: Union[str, Sequence[str], None] = '07a5cf5d5bed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'user_dashboard_layouts',
        sa.Column('project_widget_order', sa.Text(), server_default='[]', nullable=False),
    )
    # NULL = never customized (the read falls back to the defaults).
    op.add_column('user_dashboard_layouts', sa.Column('project_hidden_widgets', sa.Text(), nullable=True))
    op.add_column('user_dashboard_layouts', sa.Column('project_wide_widgets', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user_dashboard_layouts', 'project_wide_widgets')
    op.drop_column('user_dashboard_layouts', 'project_hidden_widgets')
    op.drop_column('user_dashboard_layouts', 'project_widget_order')
