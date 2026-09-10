"""
Shared pytest fixtures for the binx-api test suite.

Test tiers (see tests/README.md for the full picture):

    tests/unit/         pure logic, no database  -> marker: unit
    tests/integration/  service layer + real DB  -> marker: integration
    tests/e2e/          full ASGI app over HTTP   -> marker: e2e
    tests/migrations/   Alembic round-trips       -> marker: migrations

Database strategy
-----------------
Everything that touches a database runs against a **real Postgres** test
database (matching production semantics: UUID columns, ``ON DELETE CASCADE``,
unique constraints raising ``IntegrityError``, ...). The URL comes from
``TEST_DATABASE_URL`` and defaults to a local ``binxportal_test`` database.

* The schema is built once per session from ``Base.metadata`` (the migrations
  get their own dedicated round-trip tests in ``tests/migrations`` and CI runs
  ``alembic check`` for model/migration drift, so the fast suite doesn't need
  to pay the migration cost).
* Each test runs inside a transaction that is **rolled back** on teardown, so
  tests never see each other's writes. The session is opened in
  ``join_transaction_mode="create_savepoint"`` so the application code's own
  ``session.commit()`` / ``session.rollback()`` calls resolve against a
  SAVEPOINT instead of the outer transaction — the rollback at teardown still
  wipes everything.

The whole session shares one event loop (configured in ``pyproject.toml``)
so the session-scoped async engine stays valid across every test.
"""

from __future__ import annotations

import os
import re
from collections.abc import AsyncGenerator
from types import SimpleNamespace

# ---------------------------------------------------------------------------
# Environment must be pinned BEFORE anything imports ``binx_api`` — several
# modules read ``get_settings()`` at import time and cache an engine bound to
# whatever ``DATABASE_URL`` resolved to then.
# ---------------------------------------------------------------------------
_TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://binxapi:binxapi@localhost:5432/binxportal_test",
)
os.environ["DATABASE_URL"] = _TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("FRONTEND_URL", "http://frontend.test")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from binx_api.core.database import Base, get_db  # noqa: E402
from binx_api.core.security import create_access_token  # noqa: E402

# Import every module that defines ORM models so ``Base.metadata`` is complete
# before ``create_all``. Ordering doesn't matter — SQLAlchemy resolves the FKs.
from binx_api.modules.agencies import models as _agency_models  # noqa: E402,F401
from binx_api.modules.ai import client as _ai_client  # noqa: E402
from binx_api.modules.ai import models as _ai_models  # noqa: E402,F401
from binx_api.modules.auth import models as _auth_models  # noqa: E402,F401
from binx_api.modules.billing import models as _billing_models  # noqa: E402,F401
from binx_api.modules.boards import models as _boards_models  # noqa: E402,F401
from binx_api.modules.client_portal import models as _client_portal_models  # noqa: E402,F401
from binx_api.modules.files import models as _file_models  # noqa: E402,F401
from binx_api.modules.invoicing import models as _invoicing_models  # noqa: E402,F401
from binx_api.modules.leads import models as _leads_models  # noqa: E402,F401
from binx_api.modules.messaging import models as _messaging_models  # noqa: E402,F401
from binx_api.modules.projects import models as _project_models  # noqa: E402,F401
from binx_api.modules.users import models as _user_models  # noqa: E402,F401
from binx_api.modules.users.models import User  # noqa: E402
from binx_api.modules.users.service import create_user  # noqa: E402

TEST_DATABASE_URL = _TEST_DATABASE_URL


# ---------------------------------------------------------------------------
# Engine + schema (session-scoped)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
async def engine() -> AsyncGenerator:
    """One async engine for the whole test session.

    ``NullPool`` keeps every connection short-lived, which sidesteps the
    "attached to a different event loop" class of asyncpg bug that a pooled
    connection can hit when it outlives the test that first opened it.
    """
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    yield eng
    await eng.dispose()


async def _reset_public_schema(conn) -> None:
    """``DROP SCHEMA public CASCADE`` — the one wipe that doesn't care about
    FK ordering, circular FKs (``project_task_comments`` <-> its attachments
    table), or leftover enum types (``token_purpose``). Far more robust than
    ``Base.metadata.drop_all`` for a throwaway Postgres database.
    """
    await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
    await conn.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="session", autouse=True)
async def _schema(engine) -> AsyncGenerator[None]:
    """Build the schema once from ``Base.metadata`` up front, wipe it at the
    end. Wiping first makes a crashed previous run self-healing."""
    async with engine.begin() as conn:
        await _reset_public_schema(conn)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await _reset_public_schema(conn)


# ---------------------------------------------------------------------------
# Per-test transaction (function-scoped)
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_session(engine, _schema) -> AsyncGenerator[AsyncSession]:
    """A session wrapped in a transaction that is rolled back after the test.

    The application's service functions call ``session.commit()`` freely;
    ``join_transaction_mode="create_savepoint"`` turns each of those into a
    SAVEPOINT release/re-open, so the data is visible within the test but the
    single outer ``rollback()`` below still undoes everything.
    """
    connection = await engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


# ---------------------------------------------------------------------------
# ASGI app + HTTP client (e2e)
# ---------------------------------------------------------------------------


@pytest.fixture
async def app(db_session: AsyncSession) -> AsyncGenerator:
    """The real FastAPI app with ``get_db`` overridden to hand out the
    test's rolled-back session, so an HTTP request and the test assertions
    that follow it see the same data."""
    from binx_api.main import app as fastapi_app

    async def _override_get_db() -> AsyncGenerator[AsyncSession]:
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient]:
    """Unauthenticated HTTP client bound to the ASGI app (no real socket)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


# ---------------------------------------------------------------------------
# Users & authentication
# ---------------------------------------------------------------------------

DEFAULT_PASSWORD = "correct horse battery staple"  # noqa: S105 - test fixture, not a real secret


@pytest.fixture
async def user(db_session: AsyncSession) -> User:
    """A verified, active user — the common starting point for e2e tests."""
    account = await create_user(
        db_session,
        user_name="alice",
        email="alice@example.com",
        full_name="Alice Anderson",
        password=DEFAULT_PASSWORD,
    )
    account.is_verified = True
    await db_session.commit()
    await db_session.refresh(account)
    return account


@pytest.fixture
async def other_user(db_session: AsyncSession) -> User:
    """A second verified user, for "someone else" / permission-boundary tests."""
    account = await create_user(
        db_session,
        user_name="bob",
        email="bob@example.com",
        full_name="Bob Baker",
        password=DEFAULT_PASSWORD,
    )
    account.is_verified = True
    await db_session.commit()
    await db_session.refresh(account)
    return account


def auth_headers(account: User) -> dict[str, str]:
    """A ``Bearer`` header carrying a valid access token for ``account`` —
    the same shape ``core.security.create_access_token`` issues at login."""
    token = create_access_token(subject=str(account.id), extra_claims={"type": "access", "role": account.role})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def auth_client(client: AsyncClient, user: User) -> AsyncClient:
    """``client`` pre-authenticated as the ``user`` fixture."""
    client.headers.update(auth_headers(user))
    return client


# ---------------------------------------------------------------------------
# AI safety net
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _generous_plan_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lift every *count* cap (agencies / clients / projects / leads / members)
    on all plans so the wider suite — which routinely builds several agencies
    per owner and many clients/projects — isn't tripped by billing limits.

    Left untouched: the AI budget/cap ceilings (so ai_client tests still see
    the real per-tier values). A test that specifically exercises a limit
    monkeypatches that one plan back to a tight value.
    """
    import dataclasses

    from binx_api.modules.billing import models as billing_models

    big = 10_000
    for key, plan in billing_models.PLANS.items():
        monkeypatch.setitem(
            billing_models.PLANS,
            key,
            dataclasses.replace(
                plan,
                max_owned_agencies=big,
                max_clients=big,
                max_active_projects=big,
                max_leads=big,
                max_team_members=big,
            ),
        )


@pytest.fixture(autouse=True)
def _no_real_anthropic_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """Forces ``ANTHROPIC_API_KEY`` unset for every test, regardless of what a
    developer's local ``.env`` has configured, so a test can never silently
    make a real (billed, slow, network-dependent) Claude API call. Tests that
    exercise the "configured" path set ``ai_client.settings.anthropic_api_key``
    back to a fake value themselves *and* monkeypatch ``_call_anthropic`` —
    see tests/integration/test_ai_client.py.
    """
    monkeypatch.setattr(_ai_client.settings, "anthropic_api_key", None)


# ---------------------------------------------------------------------------
# Email capture
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[?&]token=([A-Za-z0-9_\-]+)")


@pytest.fixture
def email_outbox(monkeypatch: pytest.MonkeyPatch) -> list[SimpleNamespace]:
    """Collects every email the code tries to send, instead of logging it.

    Patches ``core.email.send_email`` — the low-level sink that every
    ``send_*_email`` helper funnels through — so the link-building logic still
    runs and the token can be pulled back out of the body with
    ``extract_token``.
    """
    outbox: list[SimpleNamespace] = []

    def _capture(*, to: str, subject: str, body: str) -> None:
        outbox.append(SimpleNamespace(to=to, subject=subject, body=body))

    monkeypatch.setattr("binx_api.core.email.send_email", _capture)
    return outbox


def extract_token(body: str) -> str:
    """Pull the ``token=...`` value out of a captured email body."""
    match = _TOKEN_RE.search(body)
    assert match is not None, f"no token= found in email body: {body!r}"
    return match.group(1)
