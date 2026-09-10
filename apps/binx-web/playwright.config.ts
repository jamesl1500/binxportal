/**
 * playwright.config.ts
 *
 * End-to-end tests run the real Next.js app against the real binx-api + Postgres.
 * `global-setup.ts` seeds a fixed demo dataset (via binx-api's `binx-api-seed-e2e`)
 * and signs in the demo staff + client accounts, saving their storage state for
 * the `staffPage` / `clientPage` fixtures in `e2e/fixtures.ts`.
 *
 * Prerequisites (CI runs these as workflow steps; locally, `pnpm dev` + the API):
 *   - Postgres up, `alembic upgrade head` applied
 *   - binx-api reachable at API_URL (default http://localhost:8000)
 *
 * @module apps/binx-web/playwright.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 1,
  workers: CI ? 1 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_500 },

  globalSetup: "./e2e/global-setup.ts",

  // The @screenshots specs (capture-marketing.spec.ts) are a manual tool, not
  // part of the suite — opt in with PW_SCREENSHOTS=1 (see `pnpm screenshots`).
  grepInvert: process.env.PW_SCREENSHOTS ? undefined : /@screenshots/,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // The responsive specs run here; other specs are desktop-only (see testMatch).
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],

  webServer: {
    // `next dev`, not a production build: `next start` marks the auth cookies
    // `Secure`, which WebKit then refuses to send back over plain-HTTP
    // localhost — so the `mobile-safari` project could never hold a session.
    command: "pnpm dev",
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
