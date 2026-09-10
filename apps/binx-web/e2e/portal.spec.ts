/**
 * portal.spec.ts — the client portal, as the seeded client contact.
 * Uses the `clientPage` fixture (pre-signed-in storage state).
 */
import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

test.describe("client portal", () => {
  test("portal home greets the client", async ({ clientPage }) => {
    await clientPage.goto("/portal");
    await expect(clientPage.getByRole("heading", { name: DEMO.clientName })).toBeVisible();
  });

  test("projects list shows the seeded project with progress", async ({ clientPage }) => {
    await clientPage.goto("/portal/projects");
    await expect(clientPage.getByRole("heading", { name: /your projects/i })).toBeVisible();
    await expect(clientPage.getByText(DEMO.projectName)).toBeVisible();
  });

  test("invoices list shows the issued invoice", async ({ clientPage }) => {
    await clientPage.goto("/portal/invoices");
    await expect(clientPage.getByRole("heading", { name: /invoices/i })).toBeVisible();
    await expect(clientPage.getByRole("link", { name: /INV-0001/ })).toContainText("9,250.00");
  });

  test("messages thread is visible and accepts a reply", async ({ clientPage }) => {
    await clientPage.goto("/portal/messages");
    await expect(clientPage.getByRole("heading", { name: /messages/i })).toBeVisible();
    await clientPage.getByRole("link", { name: /Northlight/ }).first().click();
    const composer = clientPage.getByPlaceholder("Write a message…");
    const reply = `Thanks — looks good from our side. ${Date.now()}`;
    await composer.fill(reply);
    await clientPage.getByRole("button", { name: "Send" }).click();
    await expect(clientPage.getByRole("paragraph").filter({ hasText: reply })).toBeVisible();
  });

  test("the client cannot reach the staff app", async ({ clientPage }) => {
    await clientPage.goto("/dashboard");
    await expect(clientPage).toHaveURL(/\/portal/);
  });
});
