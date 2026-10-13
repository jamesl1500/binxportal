# Version Control Flow

This repo has two protected branches: `master` and `staging`. This doc is the
checklist for how a change should move from your machine to production.

## The flow

```
feature/your-branch
      │  PR → staging (fast checks)
      ▼
   staging  ──────────────────────────────────┐
      │  PR → master (full checks incl. e2e)  │
      ▼                                        │
   master  ── push ──► auto-deploys to STAGING ENVIRONMENT
      │                (staging.binxportal.com, via deploy.yml)
      │
      │  manual: gh workflow run promote.yml -f sha=<sha>
      ▼
  PRODUCTION (www.binxportal.com / api.binxportal.com)
```

**Important naming gotcha:** the `staging` *git branch* and the *staging
environment* (staging.binxportal.com) are two different things.
`deploy.yml` deploys to the staging environment on every push to **`master`**,
not on push to the `staging` branch. The `staging` branch is purely a
pre-merge integration branch for grouping feature work before it lands on
`master` — it has no CI/CD trigger of its own today.

So in practice:
1. Open feature branches off `staging` (or off `master` directly for small
   fixes — either is fine, `staging` is there to batch things up).
2. PR into `staging` when a feature is ready for broader testing.
3. Periodically, PR `staging` → `master` once things look good together.
4. The moment that PR merges, `master`'s push trigger builds images and
   auto-deploys them to the staging *environment* for a final look.
5. When you're happy with what's live on staging.binxportal.com, promote the
   exact same images to production:
   ```
   gh workflow run promote.yml -f sha=<commit-sha>
   ```
   (defaults to the tip of `master` if you omit `-f sha=`). Nothing is
   rebuilt — it redeploys the images `deploy.yml` already pushed for that
   commit. Rolling back is the same command with an older sha.

## Branch protection (GitHub Rulesets)

Both `master` and `staging` are protected via **Settings → Rules → Rulesets**.
Current config:

### `protect-master`
- Restrict deletions, block force pushes
- Require a pull request before merging (0 required approvals — solo dev,
  PR + CI is the real gate)
- Require conversation resolution before merging
- Require status checks to pass, branch must be up to date:
  - `binx-api CI`: `lint`, `migrations`, `test`
  - `binx-web CI`: `lint`, `unit`, `e2e`

### `protect-staging`
- Restrict deletions, block force pushes
- Require a pull request before merging (0 required approvals)
- Require status checks to pass (no "up to date" requirement, for faster
  merges):
  - `binx-api CI`: `lint`, `migrations`, `test`
  - `binx-web CI`: `lint`, `unit`
  - `e2e` is **not required** here — it's flaked before (see
    `chore/e2e-stability-and-polish`) and this is the lower-stakes
    integration branch. It still runs for visibility; it's just not blocking.
    `e2e` is required on `master`, so nothing with a genuinely broken e2e
    run reaches the branch that gets promoted to prod.

No bypass actors are configured on either ruleset. If CI is broken and you
need an emergency merge, add yourself to the ruleset's bypass list
temporarily rather than disabling the rule.

## Why `infra CI` (`synth`) isn't a required check

`infra CI` only runs when a PR touches `infra/**`, so requiring it would
leave any PR that doesn't touch infra permanently stuck "waiting" on a check
that will never run. It's left optional/advisory; review its result manually
on PRs that do touch `infra/`.

## CI gotchas worth knowing before you push

- Any backend schema/router/model change needs both generated files
  regenerated and committed, or `binx-api CI / lint` and `binx-web CI / lint`
  will fail on the diff:
  - `apps/binx-api/openapi.json` — regenerate with `uv run binx-api-openapi`
    from `apps/binx-api`
  - `apps/binx-web/src/lib/api-schema.d.ts` — regenerate with `pnpm gen:api`
    from `apps/binx-web`
- New Alembic migrations must give new tables the exact same
  `created_at`/`updated_at` shape as `core/database.py::Base` (both
  `nullable=True`, `server_default=CURRENT_TIMESTAMP`, `updated_at` also
  needs `onupdate`) — `pytest` won't catch a mismatch, but CI's
  `binx-api CI / migrations` job (`alembic check`) will.
