/**
 * auth.spec.ts — sign-in / sign-up / password reset, against the real API.
 */
import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

test.describe("authentication", () => {
  test("signup form validates before it submits", async ({ page }) => {
    await page.goto("/auth/signup");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/full name is required/i)).toBeVisible();
    await expect(page.getByText(/at least 12 characters/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signup$/);
  });

  test("wrong credentials surface the API's reason", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator("#email").fill(DEMO.staff.email);
    await page.locator("#password").fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  async function signIn(page: import("@playwright/test").Page, email: string, landing: RegExp): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await page.goto("/auth/login");
      await page.getByRole("button", { name: /sign in/i }).waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(DEMO.password);
      await Promise.all([
        page.waitForURL(landing, { timeout: 15_000 }).catch(() => {}),
        page.getByRole("button", { name: /sign in/i }).click(),
      ]);
      if (landing.test(page.url())) return;
    }
    throw new Error(`sign-in as ${email} never reached ${landing}`);
  }

  test("staff sign-in lands on the dashboard", async ({ page }) => {
    await signIn(page, DEMO.staff.email, /\/dashboard/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  });

  test("client sign-in lands on the portal", async ({ page }) => {
    await signIn(page, DEMO.client.email, /\/portal/);
    await expect(page.getByRole("heading", { name: DEMO.clientName })).toBeVisible();
  });

  test("forgot-password accepts an email and confirms", async ({ page }) => {
    await page.goto("/auth/forgot-password");
    await page.locator('input[type="email"]').fill(DEMO.staff.email);
    await page.getByRole("button", { name: /send|reset|email/i }).first().click();
    await expect(page.getByText(/if an account|check your (inbox|email)|sent/i)).toBeVisible();
  });

  test("an unauthenticated visitor cannot reach the app", async ({ page }) => {
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
