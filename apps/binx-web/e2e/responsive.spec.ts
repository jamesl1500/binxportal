/**
 * responsive.spec.ts — the mobile-responsiveness audit.
 *
 * Runs on the `desktop-chromium` project (where the per-describe `viewport`
 * overrides apply) and the `mobile-safari` project (iPhone 13). The core
 * assertion is "no page-level horizontal scroll" at phone width — the failure
 * mode that a stray fixed width or an unwrapped table produces.
 */
import path from "node:path";

import { test, expect } from "./fixtures";
import { AUTH_DIR, DEMO } from "./fixtures";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };

async function expectNoHorizontalScroll(page: import("@playwright/test").Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(
    overflow.scrollWidth,
    `page scrolls horizontally: ${overflow.scrollWidth}px content in ${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

const PUBLIC_PAGES = [
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/auth/login",
  "/auth/signup",
  "/alternatives/dubsado",
  "/alternatives/honeybook",
  "/alternatives/copilot-assembly",
  "/alternatives/bloom",
  "/compare/notion-stripe-drive",
  "/for/design-studios",
  "/for/marketing-teams",
  "/for/branding-agencies",
  "/for/freelance-collectives",
  "/free-client-portal",
];

for (const size of [PHONE, TABLET]) {
  test.describe(`public pages @ ${size.width}px`, () => {
    test.use({ viewport: size });

    for (const p of PUBLIC_PAGES) {
      test(`${p} has no horizontal scroll`, async ({ page }) => {
        await page.goto(p);
        await page.waitForLoadState("domcontentloaded");
        await expectNoHorizontalScroll(page);
      });
    }
  });
}

test.describe("marketing header collapses on phones", () => {
  test.use({ viewport: PHONE });

  test("the primary nav is hidden and the menu button is shown", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Pricing" })).toBeHidden();
  });
});

test.describe("authenticated pages @ phone width", () => {
  // Each test opens its own storage-state context; run them one at a time so a
  // dozen parallel sessions don't stampede the API's refresh-token rotation.
  test.describe.configure({ mode: "serial" });

  const authedPages = ["/dashboard", "/clients", "/projects", "/invoices", "/leads", "/messages"];

  for (const p of authedPages) {
    test(`staff ${p} has no horizontal scroll`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: path.join(AUTH_DIR, "staff.json"),
        viewport: PHONE,
      });
      const page = await context.newPage();
      await page.goto(p);
      await page.waitForLoadState("domcontentloaded");
      await expectNoHorizontalScroll(page);
      await context.close();
    });
  }

  const portalPages = ["/portal", "/portal/invoices", "/portal/messages"];

  for (const p of portalPages) {
    test(`portal ${p} has no horizontal scroll`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: path.join(AUTH_DIR, "client.json"),
        viewport: PHONE,
      });
      const page = await context.newPage();
      await page.goto(p);
      await page.waitForLoadState("domcontentloaded");
      await expectNoHorizontalScroll(page);
      await context.close();
    });
  }

  test("portal header collapses the tab nav behind a menu button", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "client.json"),
      viewport: PHONE,
    });
    const page = await context.newPage();
    await page.goto("/portal");
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Client portal" }).getByRole("link", { name: "Invoices" }),
    ).toBeHidden();

    await page.getByRole("button", { name: /open menu/i }).click();
    await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await context.close();
  });

  test("portal project detail has no horizontal scroll", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "client.json"),
      viewport: PHONE,
    });
    const page = await context.newPage();
    await page.goto("/portal/projects");
    await expect(page.getByRole("heading", { name: /your projects/i })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(DEMO.projectName) }).click();
    await expect(page.getByRole("heading", { name: DEMO.projectName })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The Board and Canvas tabs are separate client bundles (the Kanban
    // board and the pan/zoom collaboration canvas) — each gets its own
    // horizontal-scroll check rather than assuming the Overview tab's pass
    // covers them.
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page.waitForLoadState("domcontentloaded");
    await expectNoHorizontalScroll(page);

    await page.getByRole("link", { name: "Canvas", exact: true }).click();
    await page.waitForLoadState("domcontentloaded");
    await expectNoHorizontalScroll(page);

    await context.close();
  });

  test("portal invoice detail has no horizontal scroll", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "client.json"),
      viewport: PHONE,
    });
    const page = await context.newPage();
    await page.goto("/portal/invoices");
    await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();

    const firstInvoice = page.locator('a[href^="/portal/invoices/"]').first();
    const hasInvoice = (await firstInvoice.count()) > 0;
    test.skip(!hasInvoice, "seeded demo agency has no invoices");
    await firstInvoice.click();
    await page.waitForLoadState("domcontentloaded");
    await expectNoHorizontalScroll(page);
    await context.close();
  });
});
