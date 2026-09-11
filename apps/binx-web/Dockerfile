# Production image for binx-web.
#
# Build context is the repo root (`docker build -f apps/binx-web/Dockerfile .`)
# — required because this is a pnpm *workspace* member, not a standalone
# package: the lockfile and workspace manifest live at the repo root, and
# Next's standalone output traces file paths relative to the workspace root
# too (server.js lands at apps/binx-web/server.js inside the output, not at
# its own root — see the `runtime` stage below).
#
# NEXT_PUBLIC_* vars are inlined into the client bundle at `next build` time,
# not read at runtime — they MUST be passed as build args, not just env vars
# on the running container.
#
# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY should be pinned across builds (a random
# one is generated per build otherwise) so an in-flight form submit from a
# page loaded just before a redeploy doesn't fail with "Failed to find Server
# Action" against the new container. Unlike the NEXT_PUBLIC_* build args,
# this one is an actual secret — it's passed via a BuildKit secret mount
# (`--secret id=next_actions_key,...`), not ARG/ENV, so it never lands in the
# image's layer history (`docker history` / `docker inspect`).

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/binx-web/package.json ./apps/binx-web/package.json
RUN pnpm fetch
RUN pnpm install --frozen-lockfile --filter binx-web...

FROM deps AS build
COPY apps/binx-web ./apps/binx-web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo/apps/binx-web
# --mount=type=secret is a BuildKit feature: the file only exists for this
# one RUN step, never becomes an image layer. The CI workflow provides it
# with `docker build --secret id=next_actions_key,src=<path-to-key-file>`;
# locally, an empty/missing secret just means Next generates a fresh
# (fine-for-local-testing) key, matching pre-existing behaviour.
RUN --mount=type=secret,id=next_actions_key \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_actions_key 2>/dev/null || true)" \
    pnpm build

FROM node:22-slim AS runtime
WORKDIR /app

COPY --from=build --chown=node:node /repo/apps/binx-web/.next/standalone/. ./
COPY --from=build --chown=node:node /repo/apps/binx-web/.next/static ./apps/binx-web/.next/static
COPY --from=build --chown=node:node /repo/apps/binx-web/public ./apps/binx-web/public

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000
CMD ["node", "apps/binx-web/server.js"]
