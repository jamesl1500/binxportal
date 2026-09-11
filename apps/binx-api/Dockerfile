# Production image for binx-api.
#
# Build context is the repo root (`docker build -f apps/binx-api/Dockerfile .`)
# so a future shared root-level asset could be pulled in; today it only
# touches apps/binx-api/.
#
# Two stages: `builder` resolves the locked dependency set with uv into a
# venv, `runtime` copies just that venv + the app source into a slim image —
# no uv, no build toolchain, no dev dependency group in the final image.

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first, cached separately from app code so a source change
# doesn't invalidate the (slow) dependency resolution/download layer.
COPY apps/binx-api/pyproject.toml apps/binx-api/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY apps/binx-api/src ./src
COPY apps/binx-api/alembic ./alembic
COPY apps/binx-api/alembic.ini apps/binx-api/README.md ./
RUN uv sync --frozen --no-dev

FROM python:3.13-slim-bookworm AS runtime
WORKDIR /app
RUN useradd --create-home --uid 1000 appuser
COPY --from=builder --chown=appuser:appuser /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    WEBSOCKETS_MAX_LINE_LENGTH=65536

COPY --chown=appuser:appuser apps/binx-api/deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER appuser
EXPOSE 8000

# The entrypoint runs `alembic upgrade head` (a no-op once the DB is already
# current) before exec'ing uvicorn — keeps migrations in lock-step with each
# deploy without a separate one-off task. See main() in src/binx_api/__init__.py
# for why this bypasses it: that hardcodes uvicorn's --reload for local dev.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "binx_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
