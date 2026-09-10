# binx-api

Python API backend for Binx Portal — FastAPI + SQLAlchemy (async) + Alembic,
PostgreSQL, managed with [uv](https://docs.astral.sh/uv/).

## Quickstart

```bash
# 1. Install dependencies (creates .venv)
uv sync --all-groups

# 2. Configure
cp .env.example .env        # then edit JWT_SECRET, DATABASE_URL, ...

# 3. Bring the database up to head
uv run alembic upgrade head

# 4. Run the API (http://localhost:8000, docs at /docs)
uv run binx-api
```

`uv run binx-api` is `uvicorn` with `--reload` plus one dev tweak: it raises
`WEBSOCKETS_MAX_LINE_LENGTH` so the collaboration/messaging websocket handshake
survives a fat `Cookie:` header (in local dev the web app and API share
`localhost`, and cookies aren't port-scoped). Running `uv run uvicorn
binx_api.main:app --reload` directly still works — export
`WEBSOCKETS_MAX_LINE_LENGTH=65536` first if the websocket handshake 431s.

A local Postgres via Docker:

```bash
docker run --rm -d --name binx-db \
  -e POSTGRES_USER=binxapi -e POSTGRES_PASSWORD=binxapi \
  -e POSTGRES_DB=binxportal -p 5432:5432 postgres:16
```

## Layout

```text
src/binx_api/
  core/         config, database, security (hashing/JWT), email, shared deps
  modules/
    auth/       signup, verify, login, refresh, password reset, email change
    users/      profile, notification & privacy settings
    agencies/   agencies, members, invitations, clients
    projects/   projects, members, roles, tags, kanban board, task comments/files, project files
    files/      (stub)
    ops/        health check
alembic/        migration environment + versioned scripts
tests/          unit / integration / e2e / migrations  (see tests/README.md)
```

Each module is `models.py` (ORM) + `schemas.py` (Pydantic I/O) + `service.py`
(business logic, the only layer that touches the session) + `router.py` (HTTP).

## Common tasks

```bash
uv run pytest                       # full test suite (needs a Postgres — see tests/README.md)
uv run pytest -m unit               # just the fast, DB-free tests
uv run ruff check . && uv run ruff format .   # lint + format
uv run alembic revision -m "..."    # new migration (autogenerate needs a DB at head)
uv run alembic check                # fail if models have drifted from migrations
```

## CI

`.github/workflows/binx-api-ci.yml` runs on every push/PR touching
`apps/binx-api/**`: `lint` (ruff), `migrations` (Alembic round-trip +
`alembic check`), and `test` (full pytest suite + coverage) against a Postgres
service container using the same image and credentials as local dev.
