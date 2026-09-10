/**
 * global-setup.ts
 *
 * Runs once before the E2E suite:
 *   1. seeds the demo dataset through binx-api (idempotent — safe to re-run)
 *   2. signs the demo staff + client accounts in through the real login form
 *      and saves their storage state for the fixtures in `fixtures.ts`
 *
 * @module apps/binx-web/e2e/global-setup.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { chromium, expect, type FullConfig, request } from "@playwright/test";

import { AUTH_DIR, DEMO } from "./fixtures";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
const API_DIR = path.resolve(__dirname, "../../binx-api");

async function waitForApi(): Promise<void> {
  const ctx = await request.newContext();
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await ctx.get(`${API_URL}/ops/ready`);
      if (res.ok()) {
        await ctx.dispose();
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await ctx.dispose();
  throw new Error(`binx-api never became ready at ${API_URL}/ops/ready`);
}

function seed(): void {
  // `python -m` rather than the `binx-api-seed-e2e` console script: on Windows a
  // running `uv run` dev server holds a lock on the generated .exe shims.
  execFileSync("uv", ["run", "--no-sync", "--project", API_DIR, "python", "-m", "binx_api.scripts.seed_e2e"], {
    cwd: API_DIR,
    stdio: "inherit",
  });
}

async function saveSignedInState(
  baseURL: string,
  email: string,
  landingPath: string,
  landingProbe: (page: import("@playwright/test").Page) => Promise<unknown>,
  outFile: string,
): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(90_000);

  const attempt = async (): Promise<void> => {
    await page.goto(`${baseURL}/auth/login`);
    // The form re-renders once when the "remember me" store hydrates; settle
    // first, then type, so the inputs don't detach mid-fill.
    await page.getByRole("button", { name: /sign in/i }).waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(DEMO.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(new RegExp(landingPath.replace("/", "\\/")), { timeout: 30_000 });
    // Confirm the session actually took: reload the protected landing page in a
    // fresh navigation and assert an authenticated element, so we never persist
    // a half-set cookie jar.
    await page.goto(`${baseURL}${landingPath}`);
    await landingProbe(page);
  };

  // The dev server occasionally serves a transient 500 on first compile of a
  // route (Turbopack HMR); a reload clears it. Retry the whole flow a few times.
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      await attempt();
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(1500);
    }
  }
  if (lastErr) throw lastErr;

  await page.context().storageState({ path: outFile });
  await browser.close();
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  await waitForApi();
  seed();

  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

  await saveSignedInState(
    baseURL,
    DEMO.staff.email,
    "/dashboard",
    (page) => expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible(),
    path.join(AUTH_DIR, "staff.json"),
  );
  await saveSignedInState(
    baseURL,
    DEMO.client.email,
    "/portal",
    (page) => expect(page.getByRole("heading", { name: DEMO.clientName })).toBeVisible(),
    path.join(AUTH_DIR, "client.json"),
  );
}
