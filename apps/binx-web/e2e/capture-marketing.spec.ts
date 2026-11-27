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

import { AUTH_DIR, clickUntilVisible, DEMO, expect, test } from "./fixtures";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
// Mirrored from binx-api's scripts/seed_e2e.py (_seed_showcase).
const SHOWCASE_PROPOSAL = "Brand & website refresh, phase two";
const SHOWCASE_SIGNED_PROPOSAL = "Kestrel Coffee packaging refresh";
const SHOWCASE_LEAD = "Alder & Oak";

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

  test("proposals — the client signing in their portal", async ({ clientPage }) => {
    await clientPage.setViewportSize(SHOT);
    await clientPage.goto("/portal/proposals");
    await clientPage.getByRole("link", { name: SHOWCASE_PROPOSAL }).click();
    await expect(clientPage.getByRole("heading", { name: SHOWCASE_PROPOSAL }).first()).toBeVisible();
    const sign = clientPage.getByRole("button", { name: "Sign proposal" });
    await clickUntilVisible(clientPage.getByRole("button", { name: "Sign this proposal" }), sign);
    await clientPage.getByRole("checkbox").check();
    await clientPage.locator("body").click({ position: { x: 5, y: 5 } });
    await sign.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await clientPage.waitForTimeout(500);
    await shoot(clientPage, "proposal-sign");
  });

  test("proposals — the signing certificate", async ({ staffPage }) => {
    await staffPage.setViewportSize(SHOT);
    await staffPage.goto("/proposals");
    await staffPage.getByRole("link", { name: SHOWCASE_SIGNED_PROPOSAL }).click();
    await staffPage.getByRole("link", { name: /view the signing certificate/i }).click();
    await expect(staffPage.getByText("The signed record matches its fingerprint.")).toBeVisible();
    await staffPage.waitForTimeout(500);
    await shoot(staffPage, "certificate");
  });

  test("lead portal — what the lead sees", async ({ salesPage, browser }) => {
    const state = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "sales.json"), "utf8"));
    const token = state.cookies.find((c: { name: string }) => c.name === "binx_access_token").value;
    const headers = { Authorization: `Bearer ${token}` };
    const agencies = await (await salesPage.request.get(`${API_URL}/agencies/mine`, { headers })).json();
    const agency = agencies.find((a: { name: string }) => a.name === DEMO.sales.agency);
    const leads = await (await salesPage.request.get(`${API_URL}/agencies/${agency.id}/leads`, { headers })).json();
    const lead = leads.find((l: { name: string }) => l.name === SHOWCASE_LEAD);
    const portal = await (
      await salesPage.request.get(`${API_URL}/agencies/${agency.id}/leads/${lead.id}/portal`, { headers })
    ).json();

    const context = await browser.newContext({ viewport: SHOT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const url = new URL(portal.url);
    await page.goto(`${url.pathname}${url.search}`);
    await expect(page.getByRole("heading", { name: "Hi Maya," })).toBeVisible();
    await page.waitForTimeout(600);
    await shoot(page, "lead-portal");
    await context.close();
  });
});
