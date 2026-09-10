"""
Migration tests.

Two kinds:

* **Static** — walk the revision graph without a database: exactly one head,
  a single linear chain back to base, and every script importable with both
  an ``upgrade`` and a ``downgrade``. These catch the classic "two people
  generated a migration off the same parent" mistake before it reaches CI.

* **Round-trip** — against a throwaway database, ``alembic upgrade head`` then
  ``alembic downgrade base`` then back up, in a fresh subprocess (exactly what
  CI / a deploy runs). Skipped automatically if the test role can't
  ``CREATE DATABASE``.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import make_url

from tests.conftest import TEST_DATABASE_URL

pytestmark = pytest.mark.migrations

BINX_API_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BINX_API_DIR / "alembic.ini"


@pytest.fixture(scope="module")
def script_dir() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))


class TestRevisionGraph:
    def test_exactly_one_head(self, script_dir: ScriptDirectory) -> None:
        heads = script_dir.get_heads()
        assert len(heads) == 1, f"expected a single migration head, found {heads}"

    def test_history_is_a_single_linear_chain_to_base(self, script_dir: ScriptDirectory) -> None:
        revisions = list(script_dir.walk_revisions())
        for rev in revisions:
            downs = rev.down_revision
            normalized = () if downs is None else (downs,) if isinstance(downs, str) else tuple(downs)
            assert len(normalized) <= 1, f"revision {rev.revision} has a branchy down_revision: {downs}"
        # The walk should terminate at exactly one base.
        assert len(script_dir.get_bases()) == 1

    def test_every_revision_has_upgrade_and_downgrade(self, script_dir: ScriptDirectory) -> None:
        for rev in script_dir.walk_revisions():
            module = rev.module
            assert callable(getattr(module, "upgrade", None)), f"{rev.revision}: no upgrade()"
            assert callable(getattr(module, "downgrade", None)), f"{rev.revision}: no downgrade()"


# ---------------------------------------------------------------------------
# Round-trip
# ---------------------------------------------------------------------------


def _run_alembic(*args: str, database_url: str) -> subprocess.CompletedProcess:
    """Run ``alembic <args>`` in a fresh interpreter, with ``DATABASE_URL``
    overridden so ``alembic/env.py`` targets the scratch database."""
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BINX_API_DIR,
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.fixture
def scratch_db():
    """A freshly-created, empty database dropped again at the end. Skips the
    test if the connection role isn't allowed to create databases."""
    import asyncio

    import asyncpg

    base = make_url(TEST_DATABASE_URL)
    scratch_name = f"{base.database}_mig_roundtrip"
    # asyncpg.connect wants a plain (non-"+driver") DSN; alembic/env.py wants the
    # async one (it builds an async engine from it).
    admin_dsn = base.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False)
    scratch_async_url = base.set(database=scratch_name).render_as_string(hide_password=False)

    async def _create() -> None:
        conn = await asyncpg.connect(admin_dsn)
        try:
            await conn.execute(f'DROP DATABASE IF EXISTS "{scratch_name}"')
            await conn.execute(f'CREATE DATABASE "{scratch_name}"')
        finally:
            await conn.close()

    async def _drop() -> None:
        conn = await asyncpg.connect(admin_dsn)
        try:
            await conn.execute(f'DROP DATABASE IF EXISTS "{scratch_name}"')
        finally:
            await conn.close()

    try:
        asyncio.run(_create())
    except asyncpg.InsufficientPrivilegeError:
        pytest.skip("test role can't CREATE DATABASE — skipping the migration round-trip")
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - infra dependent
        pytest.skip(f"no reachable Postgres for the migration round-trip: {exc}")

    yield scratch_async_url

    asyncio.run(_drop())


def test_upgrade_then_downgrade_then_upgrade_round_trips(scratch_db: str) -> None:
    up = _run_alembic("upgrade", "head", database_url=scratch_db)
    assert up.returncode == 0, up.stderr

    down = _run_alembic("downgrade", "base", database_url=scratch_db)
    assert down.returncode == 0, down.stderr

    up_again = _run_alembic("upgrade", "head", database_url=scratch_db)
    assert up_again.returncode == 0, up_again.stderr
