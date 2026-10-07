/**
 * portal.spec.ts — the client portal, as the seeded client contact.
 * Uses the `clientPage` fixture (pre-signed-in storage state).
 */
import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

test.describe("client portal", () => {
  test("portal home greets the contact by name and lists what needs them", async ({ clientPage }) => {
    await clientPage.goto("/portal");
    const firstName = DEMO.client.name.split(" ")[0];
    await expect(clientPage.getByRole("heading", { level: 1, name: new RegExp(firstName) })).toBeVisible();
    await expect(clientPage.getByText(`${DEMO.clientName} · ${DEMO.agency}`)).toBeVisible();
    // The seeded invoice is issued and unpaid, so it's waiting on the client.
    await expect(clientPage.getByRole("heading", { name: /needs your attention/i })).toBeVisible();
    await expect(clientPage.getByRole("link", { name: /Invoice INV-0001/ })).toBeVisible();
  });

  test("the getting-started checklist ticks off a step when it's followed", async ({ clientPage }) => {
    await clientPage.goto("/portal");
    const checklist = clientPage.getByRole("region", { name: /getting started|you're all set up/i });
    await expect(checklist).toBeVisible();
    // Following a step saves progress in the background (a server action).
    // Navigation now commits instantly (the route's loading skeleton), so
    // wait for that save to land before reloading /portal to check it.
    const saved = clientPage.waitForResponse(
      (res) => res.request().method() === "POST" && "next-action" in res.request().headers(),
    );
    await checklist.getByRole("link", { name: /check in on your projects/i }).click();
    await expect(clientPage).toHaveURL(/\/portal\/projects$/);
    await saved;

    await clientPage.goto("/portal");
    await expect(checklist.getByRole("link", { name: /check in on your projects\s*\(done\)/i })).toBeVisible();
  });

  test("the welcome tour reopens from the sidebar and can be skipped", async ({ clientPage }) => {
    await clientPage.goto("/portal");
    const menu = clientPage.getByRole("button", { name: "Open menu" });
    if (await menu.isVisible()) await menu.click();
    await clientPage.getByRole("button", { name: "Take the tour" }).click();

    const firstName = DEMO.client.name.split(" ")[0];
    await expect(clientPage.getByRole("heading", { name: `Welcome, ${firstName}` })).toBeVisible();
    await clientPage.getByRole("button", { name: "Show me around" }).click();
    await expect(clientPage.getByRole("heading", { name: "Everything that needs you, first" })).toBeVisible();
    await clientPage.getByRole("button", { name: "Skip tour" }).click();
    await expect(clientPage.getByRole("dialog")).toBeHidden();
  });

  test("the sidebar highlights the current section", async ({ clientPage }) => {
    await clientPage.goto("/portal/invoices");
    const menu = clientPage.getByRole("button", { name: "Open menu" });
    if (await menu.isVisible()) await menu.click();
    const nav = clientPage.getByRole("navigation", { name: "Client portal" });
    await expect(nav.getByRole("link", { name: /^Invoices/ })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: /^Projects/ }).click();
    await expect(clientPage).toHaveURL(/\/portal\/projects$/);
    await expect(clientPage.getByRole("heading", { name: /your projects/i })).toBeVisible();
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

  test("a project's Overview/Board/Canvas tabs switch pages, and the board shows real tasks", async ({
    clientPage,
  }) => {
    await clientPage.goto("/portal/projects");
    await clientPage.getByRole("link", { name: new RegExp(DEMO.projectName) }).click();

    const tabs = clientPage.getByRole("navigation", { name: "Project" });
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "true");
    await expect(clientPage.getByRole("heading", { name: "Progress" })).toBeVisible();

    await tabs.getByRole("link", { name: "Board" }).click();
    await expect(clientPage).toHaveURL(/\/board$/);
    await expect(tabs.getByRole("link", { name: "Board" })).toHaveAttribute("data-active", "true");
    // Seeded onto this project in "In Progress" — see seed_e2e.py.
    await expect(clientPage.getByText("Homepage wireframe")).toBeVisible();
    await expect(clientPage.getByRole("heading", { name: "Progress" })).not.toBeVisible();

    await tabs.getByRole("link", { name: "Canvas" }).click();
    await expect(clientPage).toHaveURL(/\/canvas$/);
    await expect(tabs.getByRole("link", { name: "Canvas" })).toHaveAttribute("data-active", "true");
  });
});
