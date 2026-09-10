"""auth_tokens expires_at index

Backs the opportunistic "delete rows expired > 1 day" sweep in
auth/service.py::_prune_stale_tokens, which runs on every token issue.

Revision ID: 8945c0ce5271
Revises: d4e5f6a7b8c9
Create Date: 2026-09-10 17:39:14.856358

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8945c0ce5271"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(op.f("ix_auth_tokens_expires_at"), "auth_tokens", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_tokens_expires_at"), table_name="auth_tokens")
