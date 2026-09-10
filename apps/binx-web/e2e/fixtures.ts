/**
 * fixtures.ts
 *
 * Shared Playwright fixtures + the demo-data constants the seed script
 * (`binx-api/src/binx_api/scripts/seed_e2e.py`) creates. Keep the constants
 * here in sync with that script.
 *
 * @module apps/binx-web/e2e/fixtures.ts
 */
import path from "node:path";

import { test as base, type Page } from "@playwright/test";

export const AUTH_DIR = path.join(__dirname, ".auth");

export const DEMO = {
  password: "e2e-Passw0rd!",
  staff: {
    email: "e2e-owner@northlight.example.com",
    name: "Morgan Reyes",
  },
  teammate: {
    email: "e2e-teammate@northlight.example.com",
    name: "Sam Okafor",
  },
  client: {
    email: "e2e-client@fjordandfield.example.com",
    name: "Priya Nair",
  },
  agency: "Northlight Studio",
  clientName: "Fjord & Field",
  projectName: "Brand & Website Refresh",
} as const;

type Fixtures = {
  staffPage: Page;
  clientPage: Page;
};

export const test = base.extend<Fixtures>({
  // Param is named `provide` (not Playwright's usual `use`) so ESLint's
  // react-hooks/rules-of-hooks doesn't mistake it for the React `use` hook.
  staffPage: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: path.join(AUTH_DIR, "staff.json") });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
  clientPage: async ({ browser }, provide) => {
    const context = await browser.newContext({ storageState: path.join(AUTH_DIR, "client.json") });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
