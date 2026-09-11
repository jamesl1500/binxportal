# Changelog

All notable changes to this project, newest first. There's no versioned
release cut yet — every push to `master` deploys (see
[DEVELOPER.md](DEVELOPER.md#deployment)) — so entries are grouped by date
rather than version number. Once a release process exists, switch this file
to [Keep a Changelog](https://keepachangelog.com/)-style version headers.

## 2026-09-11

### Fixed
- GitHub Actions couldn't deploy: the OIDC trust policy used the classic
  `repo:OWNER/REPO` subject format, but this repo was created after
  GitHub's July 2026 immutable-subject-claims change, so its tokens use
  `repo:OWNER@OWNER_ID/REPO@REPO_ID` instead.
- The SSM `SendCommand` permission pointed at the wrong account for the
  AWS-owned `AWS-RunShellScript` document (public documents live under an
  empty account segment, not the caller's account).
- Resolved pre-existing Alembic drift (7 redundant unique constraints, a
  `users.created_at` nullability mismatch) that predated this work — the
  `migrations` CI job now passes cleanly.

### Added
- **AWS deployment**: the whole stack now runs in production — one EC2
  instance, Docker Compose (`api`, `web`, `db`, `redis`, `caddy`), Caddy
  handling automatic HTTPS. AWS infrastructure (Route 53, ECR, the GitHub
  OIDC deploy role, daily EBS backups) is managed via CDK in `infra/`.
  `deploy.yml` builds, pushes, and redeploys via SSM on every push to
  `master` — no SSH from CI.
- A single `GET /agencies/{id}/dashboard` endpoint replacing the 7 separate
  calls the dashboard page used to make per render.
- The dashboard's AI briefing is now cached per agency/member/day instead
  of calling Claude on every page load — a `?refresh=true` param (wired to
  the existing Refresh button) forces regeneration.

## 2026-09-10

### Added
- The full API and web app, end to end — committed as four logical
  commits covering repo tooling, the complete FastAPI backend (16
  modules), the complete Next.js application (staff app, client portal,
  marketing site), and the test suites (Playwright E2E across desktop +
  mobile viewports, Vitest unit tests with enforced coverage thresholds,
  real screenshots on the marketing homepage).
- Generated TypeScript API types from the backend's OpenAPI schema, wired
  into the web app's `lib/*.ts` request/response types in place of
  hand-maintained interfaces — closes a whole class of drift bugs.

### Fixed
- Hardened auth: per-endpoint rate limiting, refresh-token family-kill on
  replay detection, a 12-character password floor with a common-password
  check, and account-enumeration fixes on signup/login.

## 2026-08-18 – 2026-08-23

Initial scaffolding: repo setup, and the first pass at authentication
(signup/login/refresh flow, scaffolding, and unit tests) before the rest of
the product was built out on 2026-09-10.
