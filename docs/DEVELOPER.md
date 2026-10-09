# Developer guide

How the pieces fit together, how to work on them locally, and how a change
gets from your machine to production.

## Architecture

```text
                         ┌─────────────────────┐
   browser  ────────────▶│  Caddy (TLS, :80/443)│
                         └──────────┬───────────┘
                    binxportal.com  │  api.binxportal.com
                         ┌──────────┴───────────┐
                         │                       │
                  ┌──────▼──────┐        ┌───────▼──────┐
                  │  binx-web   │───────▶│   binx-api   │
                  │  (Next.js)  │  HTTP  │  (FastAPI)   │
                  └─────────────┘        └───┬──────┬───┘
                                              │      │
                                       ┌──────▼─┐  ┌─▼─────┐
                                       │Postgres│  │ Redis │
                                       └────────┘  └───────┘
```

- **`apps/binx-api`** — FastAPI, fully async (SQLAlchemy + asyncpg), one
  module per domain area (`auth`, `agencies`, `projects`, `invoicing`,
  `leads`, `messaging`, `boards`, `ai`, `billing`, `activity`,
  `notifications`, `dashboard`, `client_portal`, `users`, `ops`). Each
  module is `models.py` / `schemas.py` / `service.py` / `router.py` — only
  `service.py` touches the DB session. Auth is opaque bearer tokens (hashed
  at rest), not JWTs. `openapi.json` at the repo root is generated from the
  live app and committed — it's the source of truth `binx-web`'s TypeScript
  types are generated from.
- **`apps/binx-web`** — Next.js App Router, three route groups sharing one
  codebase: `(app)` (the staff product), `(portal)` (the client-facing
  portal), `(marketing)` (the public site). Server components/actions call
  `binx-api` directly (server-only `lib/*.ts`); a thin `lib/*-client.ts`
  layer exists for the handful of things that need to run in the browser
  (the canvas, messaging websocket, notification polling).
- **`apps/binx-mobile`** — Expo/React Native scaffold. Not built out yet.
- **`infra/`** — the AWS CDK app that provisions everything *around* the one
  EC2 instance the whole stack runs on. See [Deployment](#deployment) below.

## Local development

Prerequisites: [uv](https://docs.astral.sh/uv/), Node 22 + pnpm (Corepack:
`corepack enable`), Docker (for Postgres, or install it natively).

```bash
# 1. Postgres
docker compose up -d db          # docker-compose.yml — local Postgres only

# 2. API
cd apps/binx-api
uv sync --all-groups
cp .env.example .env             # defaults match the compose Postgres above
uv run alembic upgrade head
uv run binx-api                  # http://localhost:8000, docs at /docs

# 3. Web (separate terminal) — no .env.example here; NEXT_PUBLIC_API_URL
#    defaults to http://localhost:8000/ if you don't set one
cd apps/binx-web
pnpm install
pnpm dev                         # http://localhost:3000
```

Each app's own README (`apps/binx-api/README.md`, `apps/binx-web/README.md`)
has more detail — module layout, common tasks, env var reference.

### Seeding data

`apps/binx-api` ships a script that creates a full demo agency (staff
account, client, project, invoices) idempotently:

```bash
cd apps/binx-api && uv run binx-api-seed-e2e
```

This is also what CI seeds before running the E2E suite against a fresh DB.

## Testing

```bash
# API — needs a Postgres reachable at TEST_DATABASE_URL (see apps/binx-api/tests/README.md)
cd apps/binx-api
uv run pytest                    # unit + integration + e2e + migrations
uv run pytest -m unit            # just the fast, DB-free ones
uv run ruff check . && uv run ruff format .

# Web
cd apps/binx-web
pnpm test                        # vitest, unit
pnpm test:coverage               # with coverage (thresholds enforced: 80% stmts/fns/lines, 70% branches)
pnpm test:e2e                    # Playwright — full-stack against a real API + Postgres
pnpm lint
pnpm exec tsc --noEmit

# Infra (infra/) — compiles + cdk synth, no AWS credentials needed
cd infra && npx tsc --noEmit && npx cdk synth
```

## Git workflow

**`master` is always deployable — merging to it ships to staging
automatically, and production is one manual promotion away** (see
[Deployment](#deployment)). That shapes the workflow:

- **Branch per change**: `feat/…`, `fix/…`, `chore/…`, `test/…`, cut from
  `master`, deleted after merge. No long-lived `develop`/`staging` branch —
  staging tracks `master` itself, so there's nothing to drift.
- **PRs, even solo.** A PR is what makes a change reviewable and gives CI a
  chance to run before anything reaches `master` — a direct push skips
  both. Squash-merge, so `master`'s history stays one commit per change and
  the PR title becomes that commit's message.
- **Commit / PR title style**: `type(scope): summary`, imperative mood —
  `feat`, `fix`, `test`, `build`, `chore`, `docs`. Body explains *why*, not
  just *what*, and what was verified. This repo's history
  (`git log --oneline`) is the reference for the style.
- **Branch protection on `master`**: require the `binx-api CI` / `binx-web
  CI` status checks (at minimum `lint` + `test`/`unit`) before merge —
  `deploy.yml` assumes broken code never reaches `master` in the first
  place, since it deploys to staging on every push there. Configure under
  Settings → Branches on GitHub.

## CI

Five workflows, all in `.github/workflows/`:

| Workflow | Triggers on | Does |
|---|---|---|
| `binx-api-ci.yml` | push/PR touching `apps/binx-api/**` | ruff lint+format, `alembic check` (model/migration drift) + up/down/up round-trip, full pytest + coverage, checks `openapi.json` is up to date |
| `binx-web-ci.yml` | push/PR touching `apps/binx-web/**` or `apps/binx-api/**` | eslint, checks `api-schema.d.ts` matches the committed `openapi.json`, vitest + coverage, Playwright E2E against a real seeded API + Postgres |
| `infra-ci.yml` | push/PR touching `infra/**` | `tsc --noEmit` + `cdk synth` (no AWS credentials needed — nothing here does an account lookup) |
| `deploy.yml` | push to `master` touching app/deploy paths | builds + pushes the Docker images to ECR, then deploys them to **staging** via SSM (see below) |
| `promote.yml` | manual (`workflow_dispatch`) | redeploys an already-built commit to **production** via SSM |

## Deployment

Production is **one EC2 instance** running the whole stack as five Docker
Compose services — `api`, `web`, `db` (Postgres), `redis`, and `caddy`
(reverse proxy + automatic Let's Encrypt TLS, no ALB/ACM). This is
deliberately the cheap, simple option, not the "correct-at-scale" one — see
`infra/lib/compute-stack.ts`'s docstring for the reasoning and the
cost/complexity tradeoff against ECS Fargate + RDS + ElastiCache.

**Staging runs on the same instance**, as a second compose project
(`docker-compose.staging.yml`: `staging-api`, `staging-web`, `staging-db`,
`staging-redis`) with its own volumes, its own secret (`binxportal/staging`),
and hard memory caps so it can't starve production. Production's Caddy
fronts it too, at `staging.binxportal.com` / `api.staging.binxportal.com`
(basic auth on the web host, `noindex` on both). Staging sends real email
through the same SES domain, under the display name "Binx Portal (Staging)"
— so don't load real client contacts into its database. It needs a 4GB
instance (`t4g.medium`); `deploy/redeploy.sh` refuses a staging deploy on
anything smaller.

**What `infra/` (AWS CDK) manages**, around that one hand-created instance:

- `DnsStack` — the `binxportal.com` Route 53 hosted zone + A records
- `ComputeStack` — an Elastic IP (so DNS survives a stop/start) and an IAM
  role (SSM Session Manager access, ECR pull, and Secrets Manager read)
  attached to the instance
- `CiCdStack` — the two ECR repos and the GitHub Actions OIDC deploy role
  (which also gets Secrets Manager read — the build needs one secret from it)
- `SecretsStack` — the single Secrets Manager entry (`binxportal/app`) every
  production secret lives in; see "Environment variables" below
- `BackupStack` — daily EBS snapshots (the only backup now that Postgres is
  self-hosted, not RDS)
- `StagingStack` — the `staging.` / `api.staging.` A records and the
  `binxportal/staging` secret, self-contained so it deploys without
  touching the stacks above

**How a deploy actually happens.** Every push to `master`
(`.github/workflows/deploy.yml`) goes to staging:

1. Authenticate to AWS via OIDC — no stored AWS keys in the repo.
2. Build three images and push them to ECR: `binx-api:sha-<sha>` (shared by
   both environments), `binx-web:sha-<sha>` (production) and
   `binx-web:staging-sha-<sha>` (staging). binx-web is built per
   environment because `NEXT_PUBLIC_*` are baked in at build time; each
   build reads `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` from its own
   environment's secret as a file-based buildx secret.
3. `aws ssm send-command` unpacks this commit's compose files, Caddyfile and
   `deploy/redeploy.sh` into `/binxportal` on the instance, then runs
   `redeploy.sh staging sha-<sha>`. No SSH, ever; the box's SSH port stays
   closed to CI, reachable only from an allow-listed IP for a human.

Then, once it looks right on staging, promote the same commit to production
(`.github/workflows/promote.yml`) — nothing is rebuilt, it runs
`redeploy.sh production sha-<sha>` with the images from step 2:

```bash
gh workflow run promote.yml -f sha=<commit>   # or Actions → Promote to production
```

Rolling back production is the same command with an older sha.

`deploy/redeploy.sh <production|staging> <tag>` itself: fetches that
environment's secret from Secrets Manager and regenerates its env file
(`.env` / `.env.staging`) from it, plus the two non-secret
`API_IMAGE`/`WEB_IMAGE` lines — nothing is hand-placed on the box — then
pulls and recreates only that environment's api/web containers and reloads
Caddy. The databases and Redis are untouched unless their own images
change, so a deploy never touches the named volumes holding Postgres data,
uploaded files, Redis, or Caddy's certs. **Never run `docker compose -f
docker-compose.prod.yml down -v`** — that's the one command that would
delete them.

### Manual / one-off operations

Re-run a deploy by hand (e.g. to debug a stuck one) from a Session Manager
shell on the box — it uses whatever config the last CI deploy unpacked:

```bash
sudo bash /binxportal/deploy/redeploy.sh staging sha-<12-char-sha>
```

Change infrastructure (new resource, IAM change, etc.): edit `infra/lib/*`,
then from `infra/`:

```bash
npx cdk diff <StackName>                  # always review before deploying
npx cdk deploy <StackName> --exclusively  # ONLY that stack
```

**Always pass `--exclusively`.** Without it CDK also deploys every stack the
named one depends on, and nearly everything depends (via `ComputeStack`) on
`SecretsStack`. If that stack's placeholder JSON in code differs at all from
what was last deployed, CloudFormation rewrites the live `binxportal/app`
secret back to `REPLACE_ME` placeholders. If that ever happens, the real
values are still in the secret's version history (`aws secretsmanager
list-secret-version-ids --include-deprecated`) — restore from there, and
don't promote to production until you have.

`cdk diff` needs real AWS credentials and the account to already be
bootstrapped (`npx cdk bootstrap aws://<account>/<region>`, one-time).

Connect to the instance without SSH (Session Manager, via the IAM role
`ComputeStack` attaches):

```bash
aws ssm start-session --target <instance-id> --region us-east-2
```

### First-time / rarely-needed box setup

`deploy/bootstrap.sh` installs Docker + the AWS CLI on a fresh instance and
creates `/binxportal`. After that the first CI deploy does the rest — it
ships the compose/Caddy files and generates the env files itself.

## Environment variables

`apps/binx-api/.env.example` documents everything the API reads, with
comments. `apps/binx-web` doesn't have one — it only reads three, all
optional in dev: `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:8000/`), `NEXT_PUBLIC_SITE_URL` / `APP_ORIGIN` (the
canonical origin used to build absolute links server-side), and `NODE_ENV`.

Production values live in the `binxportal/app` Secrets Manager secret and
staging's in `binxportal/staging` — never committed; see `.env.prod.example`
at the repo root for the shape of both.

### Stripe (local test-mode smoke test)

Platform billing (`modules/billing/`) and client-invoice payments via Stripe
Connect (`modules/invoicing/` + `modules/client_portal/`) are both fully
gated behind `STRIPE_SECRET_KEY` being set — unset (the default), everything
behaves exactly as before Stripe existed. The automated test suite never
calls real Stripe (see `core/stripe_client.py`'s module docstring); to
actually exercise the real integration once:

1. Stripe Dashboard → confirm **Test mode**. Create three Products
   (Starter/Pro/Scale), one recurring monthly Price each, and set
   `STRIPE_PRICE_ID_STARTER`/`_PRO`/`_SCALE` in `apps/binx-api/.env` to their
   ids.
2. Developers → API keys → test **Secret key** → `STRIPE_SECRET_KEY`.
3. Settings → Connect → confirm Express is enabled in test mode.
4. `stripe listen --forward-to localhost:8000/webhooks/stripe/platform` →
   copy the printed secret into `STRIPE_WEBHOOK_SECRET`. A second listener
   (or a Dashboard endpoint with "Listen to events on Connected accounts")
   pointed at `localhost:8000/webhooks/stripe/connect` →
   `STRIPE_CONNECT_WEBHOOK_SECRET`.
5. Restart the API. Subscribe to a paid plan from Settings → Plan and
   connect Stripe from Settings → Invoicing, using card `4242 4242 4242 4242`
   (any future expiry, any CVC); use `4000 0000 0000 0002` to test a declined
   payment.
