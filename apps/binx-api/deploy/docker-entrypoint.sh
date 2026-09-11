#!/usr/bin/env bash
# Container entrypoint: bring the DB schema to head, then exec whatever CMD
# was given (normally uvicorn). `alembic upgrade head` is a no-op when the
# DB is already current, so this is safe to run on every container start —
# including every redeploy, without a separate one-off migration step.
set -euo pipefail

echo "[entrypoint] running migrations..."
alembic upgrade head

echo "[entrypoint] starting: $*"
exec "$@"
