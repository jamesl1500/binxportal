/**
 * marketing.spec.ts — the public site: no auth, no backend data.
 */
import { test, expect } from "./fixtures";

test.describe("marketing site", () => {
  test("home renders the hero and primary CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Run the whole agency");
    await expect(page).toHaveTitle(/Binx/);

    await expect(page.getByRole("link", { name: /get started free/i }).first()).toHaveAttribute(
      "href",
      "/auth/signup",
    );
    await expect(page.getByRole("link", { name: /see everything it does/i })).toHaveAttribute("href", "/features");
  });

  const pages = [
    { path: "/features", heading: "One tool, the whole agency" },
    { path: "/pricing", heading: "Plans that grow with the agency" },
    { path: "/about", heading: "Built for the agencies" },
    { path: "/contact", heading: "Talk to a human" },
  ];

  for (const { path, heading } of pages) {
    test(`${path} loads with its heading and a suffixed title`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
      await expect(page).toHaveTitle(/· Binx$/);
    });
  }

  test("primary nav moves between pages and marks the active link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Pricing" }),
    ).toHaveAttribute("data-active", "true");
  });

  test("the homepage feature panels show real product screenshots", async ({ page }) => {
    await page.goto("/");
    const shots = page.locator('img[src*="marketing"]');
    await expect(shots.first()).toBeVisible();
    expect(await shots.count()).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < (await shots.count()); i++) {
      await expect(shots.nth(i)).toHaveJSProperty("complete", true);
      expect(await shots.nth(i).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }
  });

  test("robots.txt and sitemap.xml are served", async ({ page }) => {
    expect((await page.goto("/robots.txt"))?.status()).toBe(200);
    const sitemap = await page.goto("/sitemap.xml");
    expect(sitemap?.status()).toBe(200);
    expect(await sitemap?.text()).toContain("/pricing");
  });

  test("app routes are noindex", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("marketing site — mobile menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the disclosure menu opens and navigates", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /open menu/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.getByRole("banner").getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/\/features$/);
  });
});
