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

  // The messages pane used to size itself off a guessed "viewport minus a
  // fixed chrome height" — wrong whenever the portal header actually
  // rendered taller than the guess, which pushed the container past the
  // bottom of the screen and made the whole page scroll instead of just the
  // conversation list/thread panes. Now the layout is a real flex-fill
  // chain, so the document itself should never need to scroll here.
  test("the messages page fills the viewport without the page itself scrolling", async ({ clientPage }) => {
    await clientPage.goto("/portal/messages");
    await clientPage.getByRole("link", { name: /Northlight/ }).first().click();
    await expect(clientPage.getByPlaceholder("Write a message…")).toBeVisible();

    const overflowsPage = await clientPage.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    );
    expect(overflowsPage).toBe(false);
  });

  test("the client cannot reach the staff app", async ({ clientPage }) => {
    await clientPage.goto("/dashboard");
    await expect(clientPage).toHaveURL(/\/portal/);
  });
});
