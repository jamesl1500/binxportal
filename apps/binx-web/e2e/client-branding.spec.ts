/**
 * client-branding.spec.ts — per-client portal branding: a staff owner sets a
 * client's welcome message and primary color from the client's Settings >
 * Branding tab, then the client contact sees it reflected on their own
 * portal. Uses both the `staffPage` and `clientPage` fixtures.
 */
import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

test.describe("client portal branding", () => {
  test("the Branding tab renders its fields", async ({ staffPage }) => {
    await staffPage.goto("/clients");
    await staffPage.getByRole("link", { name: DEMO.clientName }).click();
    await staffPage.getByRole("link", { name: "Settings" }).click();
    await staffPage.getByRole("button", { name: "Branding" }).click();

    await expect(staffPage.getByLabel("Primary colour", { exact: true })).toBeVisible();
    await expect(staffPage.getByLabel("Accent colour", { exact: true })).toBeVisible();
    await expect(staffPage.getByLabel("Welcome message")).toBeVisible();
    await expect(staffPage.getByText(/drop an image, or choose a file/i)).toBeVisible();
  });

  test("a welcome message set by staff shows up on the client's own portal", async ({ staffPage, clientPage }) => {
    const message = `Glad to have you here! ${Date.now()}`;

    await staffPage.goto("/clients");
    await staffPage.getByRole("link", { name: DEMO.clientName }).click();
    await staffPage.getByRole("link", { name: "Settings" }).click();
    await staffPage.getByRole("button", { name: "Branding" }).click();

    const welcome = staffPage.getByLabel("Welcome message");
    await welcome.fill(message);
    await staffPage.getByRole("button", { name: "Save branding" }).click();
    await expect(staffPage.getByText("Branding saved.")).toBeVisible();

    await clientPage.goto("/portal");
    await expect(clientPage.getByText(message)).toBeVisible();
  });

  test("a primary color set by staff colors the client's own portal", async ({ staffPage, clientPage }) => {
    await staffPage.goto("/clients");
    await staffPage.getByRole("link", { name: DEMO.clientName }).click();
    await staffPage.getByRole("link", { name: "Settings" }).click();
    await staffPage.getByRole("button", { name: "Branding" }).click();

    const primaryColor = staffPage.getByLabel("Primary colour", { exact: true });
    await primaryColor.fill("#1d4ed8");
    await staffPage.getByRole("button", { name: "Save branding" }).click();
    await expect(staffPage.getByText("Branding saved.")).toBeVisible();

    await clientPage.goto("/portal");
    // Set once on the portal root (see (portal)/layout.tsx) as a CSS custom
    // property and consumed everywhere the portal picks up branding — the
    // progress bar fill, the Pay button, the active nav tab, etc. Checking
    // the seeded project's progress bar proves the whole chain, not just
    // that the property exists somewhere.
    const fillColor = await clientPage
      .locator('[class*="fill"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fillColor).toBe("rgb(29, 78, 216)");
  });
});
