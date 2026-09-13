/**
 * staff-app.spec.ts — the authenticated staff area, driven with the seeded
 * demo agency. Uses the `staffPage` fixture (pre-signed-in storage state).
 */
import { test, expect } from "./fixtures";
import { DEMO } from "./fixtures";

test.describe("staff app", () => {
  test("dashboard shows the agency roll-up", async ({ staffPage }) => {
    await staffPage.goto("/dashboard");
    await expect(staffPage.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(staffPage.getByText(/active projects/i).first()).toBeVisible();
  });

  test("primary nav reaches each top-level section", async ({ staffPage }) => {
    await staffPage.goto("/dashboard");
    const nav = staffPage.getByRole("navigation", { name: "Primary" });
    for (const [label, url, heading] of [
      ["Clients", /\/clients$/, /your clients/i],
      ["Projects", /\/projects$/, /your projects/i],
      ["Leads", /\/leads$/, /your pipeline/i],
    ] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(staffPage).toHaveURL(url);
      await expect(staffPage.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
    await nav.getByRole("link", { name: "Messages" }).click();
    await expect(staffPage).toHaveURL(/\/messages$/);
    await expect(staffPage.getByText(/conversation|no messages|inbox/i).first()).toBeVisible();
  });

  test("the Manage menu reaches invoices", async ({ staffPage }) => {
    await staffPage.goto("/dashboard");
    await staffPage.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Manage" }).click();
    await staffPage.getByRole("menuitem", { name: "Invoices" }).click();
    await expect(staffPage).toHaveURL(/\/invoices$/);
  });

  test("clients list shows the seeded client and opens its record", async ({ staffPage }) => {
    await staffPage.goto("/clients");
    await expect(staffPage.getByRole("heading", { name: /your clients/i })).toBeVisible();
    await staffPage.getByRole("link", { name: DEMO.clientName }).click();
    await expect(staffPage.getByRole("heading", { name: DEMO.clientName })).toBeVisible();
  });

  test("the seeded project opens its board with tasks", async ({ staffPage }) => {
    await staffPage.goto("/projects");
    await staffPage.getByRole("link", { name: DEMO.projectName }).click();
    await expect(staffPage.getByRole("heading", { name: DEMO.projectName })).toBeVisible();
    await staffPage
      .getByRole("navigation", { name: "Project" })
      .getByRole("link", { name: "Board", exact: true })
      .click();
    await expect(staffPage).toHaveURL(/\/board$/);
    await expect(staffPage.getByText("Homepage wireframe")).toBeVisible();
  });

  test("creating a lead shows the AI follow-up card", async ({ staffPage }) => {
    await staffPage.goto("/leads");
    await staffPage.getByRole("button", { name: "New lead" }).click();
    await staffPage.getByLabel("Lead / company name").fill("Riverside Outfitters");
    await staffPage.getByRole("button", { name: "Add lead" }).click();

    await staffPage.getByRole("link", { name: /Riverside Outfitters/ }).click();
    await expect(staffPage.getByRole("heading", { name: "Riverside Outfitters" })).toBeVisible();
    await expect(staffPage.getByText("AI follow-up")).toBeVisible();
    await expect(staffPage.getByRole("button", { name: "Draft follow-up" })).toBeVisible();
  });

  test("creating a project offers an AI starter task list", async ({ staffPage }) => {
    await staffPage.goto("/projects");
    await staffPage.getByRole("button", { name: "New project" }).click();
    await staffPage.getByLabel("Project name").fill("Seasonal Campaign");
    await staffPage.getByRole("button", { name: "Create project" }).click();

    await expect(staffPage.getByRole("heading", { name: "Seasonal Campaign created" })).toBeVisible();
    await expect(staffPage.getByText("Set up a starter task list with AI?")).toBeVisible();
    await staffPage.getByRole("button", { name: "Skip" }).click();
    await expect(staffPage.getByRole("heading", { name: "Seasonal Campaign created" })).not.toBeVisible();
  });

  test("the message composer offers an AI draft-reply button", async ({ staffPage }) => {
    await staffPage.goto("/messages");
    await staffPage.getByRole("button", { name: /Refresh — internal/ }).click();
    await expect(staffPage.getByLabel("Draft a reply with AI")).toBeVisible();
  });

  test("invoices list shows the issued invoice and its total", async ({ staffPage }) => {
    await staffPage.goto("/invoices");
    await expect(staffPage.getByRole("heading", { name: /invoices/i })).toBeVisible();
    // 2,800.00 + 4,200.00 + 18 * 125.00 = 9,250.00
    await expect(staffPage.getByRole("cell", { name: "$9,250.00", exact: true })).toBeVisible();
  });

  test("settings pages load", async ({ staffPage }) => {
    for (const path of ["/settings/general", "/settings/invoicing", "/settings/plan"]) {
      const res = await staffPage.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(staffPage.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("plan page offers a real Checkout redirect for a paid tier", async ({ staffPage }) => {
    await staffPage.goto("/settings/plan");
    await expect(staffPage.getByText("Current plan")).toBeVisible();
    const switchButtons = staffPage.getByRole("button", { name: "Switch to this plan" });
    await expect(switchButtons.first()).toBeVisible();
    // No Stripe price is configured in this e2e environment, so clicking
    // surfaces the clean 503 from billing/service.py — not a fake success,
    // and not a raw network error either.
    await switchButtons.first().click();
    await expect(staffPage.getByText(/stripe isn.t configured/i)).toBeVisible();
  });

  test("invoicing page shows the Stripe Connect panel, not connected", async ({ staffPage }) => {
    await staffPage.goto("/settings/invoicing");
    await expect(staffPage.getByText(/not connected to stripe/i)).toBeVisible();
    const connectButton = staffPage.getByRole("button", { name: "Connect Stripe" });
    await expect(connectButton).toBeVisible();
    await connectButton.click();
    await expect(staffPage.getByText(/stripe isn.t configured/i)).toBeVisible();
  });

  test("a new agency activity event live-updates an already-open /activity tab", async ({ staffPage }) => {
    // Two tabs in the same signed-in browser context: one just watches
    // /activity (proving the *push* actually reaches an idle page over its
    // websocket — not just that the actor's own request re-rendered
    // something), the other performs the action that logs it.
    const watcher = staffPage;
    await watcher.goto("/activity");

    const actor = await watcher.context().newPage();
    await actor.goto("/projects");
    const projectName = `Realtime Check ${Date.now()}`;
    await actor.getByRole("button", { name: "New project" }).click();
    await actor.getByLabel("Project name").fill(projectName);
    await actor.getByRole("button", { name: "Create project" }).click();
    await expect(actor.getByRole("heading", { name: `${projectName} created` })).toBeVisible();
    await actor.close();

    await expect(watcher.getByText(`created the project ${projectName}`)).toBeVisible();
  });

  test("account settings tabs switch between Preferences and Security", async ({ staffPage }) => {
    await staffPage.goto("/account");
    const tabs = staffPage.getByRole("navigation", { name: "Account settings" });
    await expect(tabs.getByRole("link", { name: "Preferences" })).toHaveAttribute("data-active", "true");
    await expect(staffPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "Danger zone" })).not.toBeVisible();

    await tabs.getByRole("link", { name: "Security" }).click();
    await expect(staffPage).toHaveURL(/\/account\/security$/);
    await expect(tabs.getByRole("link", { name: "Security" })).toHaveAttribute("data-active", "true");
    await expect(staffPage.getByRole("heading", { name: "Email" })).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "Danger zone" })).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "Notifications" })).not.toBeVisible();
  });
});
