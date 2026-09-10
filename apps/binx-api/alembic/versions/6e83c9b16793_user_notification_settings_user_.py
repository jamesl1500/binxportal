"""user_notification_settings, user_privacy_settings tables

Revision ID: 6e83c9b16793
Revises: 8316825cb751
Create Date: 2026-08-26 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e83c9b16793'
down_revision: Union[str, Sequence[str], None] = '8316825cb751'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('user_notification_settings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('email_product_updates', sa.Boolean(), nullable=False),
    sa.Column('email_client_activity', sa.Boolean(), nullable=False),
    sa.Column('email_team_mentions', sa.Boolean(), nullable=False),
    sa.Column('email_weekly_digest', sa.Boolean(), nullable=False),
    sa.Column('email_security_alerts', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_notification_settings_user_id'), 'user_notification_settings', ['user_id'], unique=True)

    op.create_table('user_privacy_settings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('profile_visibility', sa.String(length=20), nullable=False),
    sa.Column('show_email_to_team', sa.Boolean(), nullable=False),
    sa.Column('show_phone_to_team', sa.Boolean(), nullable=False),
    sa.Column('activity_status_visible', sa.Boolean(), nullable=False),
    sa.Column('analytics_opt_out', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_privacy_settings_user_id'), 'user_privacy_settings', ['user_id'], unique=True)
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_user_privacy_settings_user_id'), table_name='user_privacy_settings')
    op.drop_table('user_privacy_settings')

    op.drop_index(op.f('ix_user_notification_settings_user_id'), table_name='user_notification_settings')
    op.drop_table('user_notification_settings')
    # ### end Alembic commands ###
