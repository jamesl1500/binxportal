"""fix schema drift: drop redundant unique constraints

Seven tables ended up with two overlapping unique indexes on the same
column: an unnamed `<table>_<col>_key` UNIQUE CONSTRAINT from the column's
original `unique=True`, and a separate `ix_<table>_<col>` unique INDEX added
later when `index=True` joined it on the model. Postgres auto-names unnamed
constraints, which `alembic check` can never reconcile against the ORM
metadata (unnamed constraints have no stable identity to diff against) — so
every run reported the same seven false positives. Dropping the redundant
`_key` constraint (and the unique index it owns) leaves the `ix_*` index,
which already enforces the same uniqueness and is what the model expects.

Revision ID: 5eabbb21669b
Revises: 8945c0ce5271
Create Date: 2026-09-11 10:19:44.525162

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5eabbb21669b'
down_revision: Union[str, Sequence[str], None] = '8945c0ce5271'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column) pairs carrying the redundant constraint. Each also has a
# matching `ix_<table>_<column>` unique index, created separately, which
# stays in place and keeps enforcing uniqueness.
_REDUNDANT_UNIQUE = [
    ("agency_ai_settings", "agency_id"),
    ("agency_invitations", "token_hash"),
    ("agency_subscriptions", "agency_id"),
    ("client_invitations", "token_hash"),
    ("project_boards", "project_id"),
    ("user_notification_settings", "user_id"),
    ("user_privacy_settings", "user_id"),
]


def upgrade() -> None:
    """Upgrade schema."""
    for table, column in _REDUNDANT_UNIQUE:
        op.drop_constraint(f"{table}_{column}_key", table, type_="unique")


def downgrade() -> None:
    """Downgrade schema."""
    for table, column in _REDUNDANT_UNIQUE:
        op.create_unique_constraint(f"{table}_{column}_key", table, [column])
