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

import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

const OUT = path.join(__dirname, "screenshots");
const SHOT = { width: 1440, height: 1024 } as const;

test.use({ viewport: SHOT, deviceScaleFactor: 2 });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

// Hide the Next.js dev-mode indicator ("Rendering…" badge) from the shots.
async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test.describe("@screenshots marketing captures", () => {
  test("client portal — project detail", async ({ clientPage }) => {
    await clientPage.setViewportSize(SHOT);
    await clientPage.goto("/portal/projects");
    await clientPage.getByText(DEMO.projectName).click();
    await expect(clientPage.getByRole("heading", { name: DEMO.projectName })).toBeVisible();
    await clientPage.waitForTimeout(600);
    await shoot(clientPage, "portal");
  });

  test("collaboration canvas — the seeded board", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/projects");
    await staffPage.getByRole("link", { name: DEMO.projectName }).click();
    await staffPage.getByRole("navigation", { name: "Project" }).getByRole("link", { name: "Canvas", exact: true }).click();
    await expect(staffPage).toHaveURL(/\/canvas$/);
    await expect(staffPage.getByText("Brand launch checklist")).toBeVisible();
    await staffPage.waitForTimeout(1200); // let the cards settle / images load
    await shoot(staffPage, "canvas");

    // The nested moodboard, with its breadcrumb trail.
    await staffPage.getByRole("button", { name: "Open board Moodboard" }).click();
    await expect(staffPage).toHaveURL(/\?board=/);
    await expect(staffPage.getByText("Coastal, warm neutrals")).toBeVisible();
    await staffPage.waitForTimeout(800);
    await shoot(staffPage, "canvas-moodboard");
  });

  test("client approvals — reviewing a column on the portal canvas", async ({ clientPage }) => {
    await clientPage.setViewportSize(SHOT);
    await clientPage.goto("/portal/projects");
    await clientPage.getByText(DEMO.projectName).click();
    await clientPage.getByRole("link", { name: "Canvas", exact: true }).click();
    await expect(clientPage).toHaveURL(/\/canvas$/);
    await expect(clientPage.getByText("Logo directions")).toBeVisible();
    await clientPage.waitForTimeout(1000);
    // Select the column: the client's "Approve all" / "Request changes" bar.
    await clientPage.getByText("Logo directions").click();
    await expect(clientPage.getByRole("button", { name: /Approve all/ })).toBeVisible();
    await clientPage.waitForTimeout(500);
    await shoot(clientPage, "approvals");
  });

  test("invoicing — creating an invoice", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/invoices/new");
    // Wait for the real form, not the route's loading skeleton.
    await expect(staffPage.getByRole("heading", { name: "New invoice" })).toBeVisible();
    await staffPage.getByLabel("Client").selectOption({ label: DEMO.clientName });
    await staffPage.getByLabel("Project (optional)").selectOption({ label: DEMO.projectName });

    const lines = [
      ["Homepage visual design", "1", "3200"],
      ["About + Contact pages", "2", "850"],
      ["Component library in code", "24", "125"],
    ];
    for (const [index, [description, qty, price]] of lines.entries()) {
      if (index > 0) await staffPage.getByRole("button", { name: "Add line" }).click();
      const n = index + 1;
      await staffPage.getByLabel(`Line ${n} description`).fill(description);
      await staffPage.getByLabel(`Line ${n} quantity`).fill(qty);
      await staffPage.getByLabel(`Line ${n} unit price`).fill(price);
    }
    await staffPage.getByLabel("Notes").fill("Phase two of the Brand & Website Refresh. Thanks for the partnership!");
    await staffPage.getByLabel("Payment instructions").fill("Pay online from your client portal, or by bank transfer within 14 days.");
    await staffPage.locator("body").click({ position: { x: 5, y: 5 } }); // drop focus rings
    // Filling the form scrolls it; bring the page title back under the nav.
    await staffPage.getByRole("heading", { name: "New invoice" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -140);
    });
    await staffPage.waitForTimeout(500);
    await shoot(staffPage, "invoicing");
  });

  test("dashboard — for a future hero shot", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/dashboard");
    await expect(staffPage.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await staffPage.waitForTimeout(800);
    await shoot(staffPage, "dashboard");
  });
});
