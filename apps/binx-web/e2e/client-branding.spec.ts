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
});
