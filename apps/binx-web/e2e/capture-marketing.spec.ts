/**
 * capture-marketing.spec.ts — NOT part of the CI E2E run.
 *
 * Captures real product screenshots from the seeded app for the marketing
 * homepage. Run it deliberately, then optimise the output:
 *
 *   pnpm seed:e2e
 *   pnpm exec playwright test --grep @screenshots --project=desktop-chromium
 *   node scripts/optimize-shots.mjs
 *
 * Raw PNGs land in `e2e/screenshots/`; `optimize-shots.mjs` writes the
 * committed `.webp`s to `public/marketing/`.
 */
import fs from "node:fs";
import path from "node:path";

import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

const OUT = path.join(__dirname, "screenshots");
const SHOT = { width: 1440, height: 1024 } as const;

test.use({ viewport: SHOT, deviceScaleFactor: 2 });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.describe("@screenshots marketing captures", () => {
  test("client portal — project detail", async ({ clientPage }) => {
    await clientPage.setViewportSize(SHOT);
    await clientPage.goto("/portal/projects");
    await clientPage.getByText(DEMO.projectName).click();
    await expect(clientPage.getByRole("heading", { name: DEMO.projectName })).toBeVisible();
    await clientPage.waitForTimeout(600);
    await clientPage.screenshot({ path: path.join(OUT, "portal.png") });
  });

  test("collaboration canvas — the seeded board", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/projects");
    await staffPage.getByRole("link", { name: DEMO.projectName }).click();
    await staffPage.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Canvas", exact: true }).click();
    await expect(staffPage).toHaveURL(/\/canvas$/);
    await staffPage.waitForTimeout(1200); // let the cards settle / images load
    await staffPage.screenshot({ path: path.join(OUT, "canvas.png") });
  });

  test("invoicing — invoice detail", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/invoices");
    await staffPage.getByRole("row", { name: /INV-0001/ }).getByRole("link").first().click();
    await expect(staffPage.getByText(/INV-0001/).first()).toBeVisible();
    await staffPage.waitForTimeout(600);
    await staffPage.screenshot({ path: path.join(OUT, "invoicing.png") });
  });

  test("dashboard — for a future hero shot", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/dashboard");
    await expect(staffPage.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await staffPage.waitForTimeout(800);
    await staffPage.screenshot({ path: path.join(OUT, "dashboard.png") });
  });
});
