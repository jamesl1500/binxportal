# binx-api test suite

A single `pytest` invocation runs everything. The suite is split into four
tiers by cost and blast radius, each with its own directory and marker.

| Directory          | Marker         | What it covers                                        | Needs a DB? |
| ------------------ | -------------- | ---------------------------------------------------- | ----------- |
| `tests/unit/`      | `unit`         | Pure logic — hashing, JWTs, settings, slugify, email link building | No |
| `tests/integration/` | `integration` | Service-layer functions against a real Postgres      | Yes         |
| `tests/e2e/`       | `e2e`          | The full ASGI app over HTTP (`httpx.AsyncClient`)     | Yes         |
| `tests/migrations/` | `migrations`  | Alembic revision-graph sanity + `upgrade`/`downgrade` round-trips | Yes (round-trips only) |

Run a single tier with its marker:

```bash
uv run pytest -m unit          # fast, no infra
uv run pytest -m "not e2e"     # everything but the HTTP layer
uv run pytest tests/e2e        # or just point at the directory
```

## Consistent flow

Every DB-backed test follows the same shape, so a new one is easy to slot in:

1. **Arrange** with `tests/factories.py` — `make_user`, `make_agency`,
   `make_client`, `make_project`, `make_task`, …. These call the *real*
   service functions, so the fixtures are wired exactly as the app would wire
   them (owner membership, seeded kanban columns, generated slugs).
2. **Act** —
   - integration tests call a `service.*` function directly with `db_session`;
   - e2e tests make an HTTP call with `client` / `auth_client` and assert on
     status code + JSON body.
3. **Assert** — on the return value, and (for mutations) by reading the row
   back so we know it actually persisted.
4. **Teardown is automatic** — see isolation below. Never write cleanup code.

e2e tests additionally group related requests into a single `async def test_*`
that walks a journey ("sign up → verify → log in → call the API"), with
numbered comments for each step. One journey per method; guard-rail cases
(wrong role, expired token, …) get their own short methods on the same class.

## Database & isolation

Everything DB-backed runs against a **real Postgres** — production semantics
matter here (UUID columns, `ON DELETE CASCADE`, unique constraints raising
`IntegrityError`, `gen_random_uuid()` in a migration). SQLite would paper over
all of that.

- Connection string: `TEST_DATABASE_URL`
  (default `postgresql+asyncpg://binxapi:binxapi@localhost:5432/binxportal_test`).
  `conftest.py` copies it into `DATABASE_URL` **before** `binx_api` is
  imported, because several modules cache an engine at import time.
- The schema is created once per session from `Base.metadata` (fast). The
  migration scripts get their own dedicated round-trip tests instead of the
  whole suite paying the migration cost.
- Each test runs inside a transaction that is **rolled back** on teardown. The
  session uses `join_transaction_mode="create_savepoint"`, so the application
  code's own `session.commit()` calls resolve against a SAVEPOINT and the
  single outer rollback still wipes everything. Tests never see each other's
  writes and order doesn't matter.
- The whole session shares one asyncio event loop (`pyproject.toml` →
  `asyncio_default_*_loop_scope = "session"`) so the session-scoped async
  engine stays valid across every test.

## Key fixtures (`conftest.py`)

| Fixture         | Scope    | What you get                                              |
| --------------- | -------- | -------------------------------------------------------- |
| `db_session`    | function | Rolled-back `AsyncSession` — the entry point for integration tests |
| `client`        | function | Unauthenticated `AsyncClient` bound to the real app (no socket) |
| `user` / `other_user` | function | A verified, active `User` (and a second one for permission-boundary tests) |
| `auth_client`   | function | `client` pre-authenticated as `user`                      |
| `auth_headers(user)` | —   | Bearer header helper for authenticating as any user       |
| `email_outbox`  | function | Captures every outgoing email; pair with `extract_token`  |

## Running Postgres locally

```bash
docker run --rm -d --name binx-test-db \
  -e POSTGRES_USER=binxapi -e POSTGRES_PASSWORD=binxapi \
  -e POSTGRES_DB=binxportal_test -p 5432:5432 postgres:16
```

CI (`.github/workflows/binx-api-ci.yml`) uses the same image and credentials as
a service container, so a green local run means a green CI run.

## Coverage

```bash
uv run pytest --cov=binx_api --cov-report=term-missing
```

Config lives in `pyproject.toml` (`[tool.coverage.*]`): branch coverage on,
Alembic excluded, the lazily-wired "future plan" stubs excluded from the
report so they don't invite gaming the number.
