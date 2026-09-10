"""client_contacts + client_invitations tables

The first client-facing surface: a ClientContact grants a Binx user account
the `/portal` view scoped to one AgencyClient; a ClientInvitation is the
pending invite that creates one on accept. See modules/client_portal/.

Revision ID: a1c9f4e07b53
Revises: c3f7a92e1d68
Create Date: 2026-09-03 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c9f4e07b53"
down_revision: str | Sequence[str] | None = "c3f7a92e1d68"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "client_contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_id", "user_id", name="uq_client_contacts_client_id_user_id"),
    )
    op.create_index(op.f("ix_client_contacts_agency_id"), "client_contacts", ["agency_id"], unique=False)
    op.create_index(op.f("ix_client_contacts_client_id"), "client_contacts", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_contacts_user_id"), "client_contacts", ["user_id"], unique=False)

    op.create_table(
        "client_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agency_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["agency_id"], ["agencies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["agency_clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_client_invitations_agency_id"), "client_invitations", ["agency_id"], unique=False)
    op.create_index(op.f("ix_client_invitations_client_id"), "client_invitations", ["client_id"], unique=False)
    op.create_index(op.f("ix_client_invitations_email"), "client_invitations", ["email"], unique=False)
    op.create_index(op.f("ix_client_invitations_token_hash"), "client_invitations", ["token_hash"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_client_invitations_token_hash"), table_name="client_invitations")
    op.drop_index(op.f("ix_client_invitations_email"), table_name="client_invitations")
    op.drop_index(op.f("ix_client_invitations_client_id"), table_name="client_invitations")
    op.drop_index(op.f("ix_client_invitations_agency_id"), table_name="client_invitations")
    op.drop_table("client_invitations")

    op.drop_index(op.f("ix_client_contacts_user_id"), table_name="client_contacts")
    op.drop_index(op.f("ix_client_contacts_client_id"), table_name="client_contacts")
    op.drop_index(op.f("ix_client_contacts_agency_id"), table_name="client_contacts")
    op.drop_table("client_contacts")
