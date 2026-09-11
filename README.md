# Binx Portal

Binx Portal is a SaaS product for creative design and web development
agencies: find and qualify leads, onboard clients, manage projects, and
invoice — all in one place.

**Live at [binxportal.com](https://binxportal.com)** · staff app at
`app.binxportal.com`, API at `api.binxportal.com`.

## Features

- **Leads CRM** — capture, score (AI-assisted), and convert prospects to clients
- **Client onboarding & portal** — a branded portal clients log into to see
  their projects, invoices, and message the team
- **Project management** — kanban boards, task lists, files, a Milanote-style
  collaboration canvas
- **Invoicing** — line items, payments, PDF-ready detail views, AI-drafted
  reminders
- **Team messaging** — real-time conversations (staff + client-portal),
  websocket-backed
- **AI throughout** — lead scoring, a daily dashboard briefing, project
  summaries, invoice reminders, an "Ask AI" assistant — all budget-capped
  per agency

## Structure

This is a pnpm/uv monorepo:

| Path | What | Stack |
|---|---|---|
| [`apps/binx-api`](apps/binx-api) | The backend | FastAPI, SQLAlchemy (async), Alembic, PostgreSQL — [uv](https://docs.astral.sh/uv/) |
| [`apps/binx-web`](apps/binx-web) | The staff app, client portal, and marketing site | Next.js 16 (App Router), React 19 |
| [`apps/binx-mobile`](apps/binx-mobile) | Mobile app | Expo / React Native — early scaffold |
| [`infra/`](infra) | Production AWS infrastructure | AWS CDK (TypeScript) |

Each app has its own README with a local-dev quickstart. For the full
picture — architecture, running everything together, testing, git workflow,
CI/CD, and how production deploys work — see **[DEVELOPER.md](DEVELOPER.md)**.

Project history lives in **[CHANGELOG.md](CHANGELOG.md)**.

## Quickstart

```bash
# API (needs a local Postgres — see apps/binx-api/README.md)
cd apps/binx-api && uv sync --all-groups && uv run alembic upgrade head && uv run binx-api

# Web (in another terminal)
cd apps/binx-web && pnpm install && pnpm dev
```

`apps/binx-web` expects the API at `http://localhost:8000` by default (see
`apps/binx-web/.env.example`). Details, env vars, and running the full test
suites are in [DEVELOPER.md](DEVELOPER.md).
