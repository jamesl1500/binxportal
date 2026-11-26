/**
 * lead-sales.spec.ts — selling to a lead, against the real API: the lead
 * portal (a branded page with their proposals and a question thread), and
 * a signed proposal turning the lead into a client: the deposit invoice,
 * then the project once it's paid.
 *
 * Runs as the Starter-plan sales agency (Harbor Lane), not Northlight: lead
 * portals need Starter, and accepting a proposal adds a client, which would
 * move Northlight's Free-plan numbers that other specs assert on.
 */
import fs from "node:fs";
import path from "node:path";

import type { Browser, Page } from "@playwright/test";

import { AUTH_DIR, clickUntilVisible, DEMO, expect, test } from "./fixtures";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 120_000 });

function salesToken(): string {
  const state = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "sales.json"), "utf8"));
  return state.cookies.find((c: { name: string }) => c.name === "binx_access_token").value;
}

async function api(page: Page, method: "get" | "post" | "put", url: string, data?: unknown) {
  const res = await page.request[method](`${API_URL}${url}`, {
    headers: { Authorization: `Bearer ${salesToken()}` },
    data,
  });
  expect(res.ok(), `${method} ${url}: ${res.status()}`).toBeTruthy();
  return res.json();
}

async function salesAgencyId(page: Page): Promise<string> {
  const mine = await api(page, "get", "/agencies/mine");
  return mine.find((a: { name: string }) => a.name === DEMO.sales.agency).id;
}

async function createLead(page: Page, agencyId: string, name: string) {
  return api(page, "post", `/agencies/${agencyId}/leads`, {
    name,
    contact_name: "Alex Kim",
    contact_email: `alex+${RUN}@northwind.example.com`,
  });
}

/** The lead's view, in a fresh browser with no session. */
async function asTheLead(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const link = new URL(url);
  await page.goto(`${link.pathname}${link.search}`);
  return { page, close: () => context.close() };
}

test.describe("lead portal", () => {
  test("turn it on, the lead asks a question, the team replies", async ({ salesPage, browser }) => {
    const agencyId = await salesAgencyId(salesPage);
    const leadName = `Kestrel ${RUN}`;
    const lead = await createLead(salesPage, agencyId, leadName);

    await salesPage.goto(`/leads/${lead.id}`);
    const card = salesPage.locator("section", { has: salesPage.getByRole("heading", { name: "Lead portal" }) });
    await clickUntilVisible(card.getByRole("button", { name: "Turn on lead portal" }), card.getByText("On", { exact: true }));
    await card.getByLabel(/welcome note/i).fill("Everything for your rebrand lives here.");
    await card.getByRole("button", { name: "Save note" }).click();
    await expect(salesPage.getByText("Saved", { exact: true })).toBeVisible();
    const url = await card.locator("code").innerText();

    const lead_ = await asTheLead(browser, url);
    await expect(lead_.page.getByRole("heading", { name: "Hi Alex," })).toBeVisible();
    await expect(lead_.page.getByText("Everything for your rebrand lives here.")).toBeVisible();
    await expect(lead_.page.getByText(/Your proposal will appear here/)).toBeVisible();
    // Each box clears once its message is saved; waiting on that (not on the
    // text, which the box itself still holds while sending) keeps the steps
    // in order.
    await lead_.page.getByLabel("Your question").fill("Does the price include the logo?");
    await lead_.page.getByRole("button", { name: "Send question" }).click();
    await expect(lead_.page.getByLabel("Your question")).toHaveValue("");
    await expect(lead_.page.getByRole("listitem").filter({ hasText: "Does the price include the logo?" })).toBeVisible();

    await salesPage.reload();
    await expect(card.getByRole("listitem").filter({ hasText: "Does the price include the logo?" })).toBeVisible();
    await card.getByLabel(/reply to/i).fill("Yes, the logo is in phase one.");
    await card.getByRole("button", { name: "Send reply" }).click();
    await expect(card.getByLabel(/reply to/i)).toHaveValue("");
    await expect(card.getByRole("listitem").filter({ hasText: "Yes, the logo is in phase one." })).toBeVisible();

    await lead_.page.reload();
    await expect(lead_.page.getByRole("listitem").filter({ hasText: "Yes, the logo is in phase one." })).toBeVisible();
    await expect(lead_.page.getByText(`${DEMO.sales.name}, ${DEMO.sales.agency}`)).toBeVisible();
    await lead_.close();
  });
});

test.describe("accepting a proposal from a lead", () => {
  test("the lead signs from their portal; they become a client, the deposit is invoiced, the project starts once it's paid", async ({
    salesPage,
    browser,
  }) => {
    const agencyId = await salesAgencyId(salesPage);
    const leadName = `Northwind ${RUN}`;
    const lead = await createLead(salesPage, agencyId, leadName);
    const portal = await api(salesPage, "put", `/agencies/${agencyId}/leads/${lead.id}/portal`, {
      welcome_message: null,
    });

    // From the lead's page: a proposal for them, prefilled.
    await salesPage.goto(`/leads/${lead.id}`);
    await salesPage.getByRole("link", { name: "New proposal" }).click();
    await expect(salesPage.getByText(/For the lead/)).toContainText(leadName);
    await expect(salesPage.getByLabel("Recipient email")).toHaveValue(`alex+${RUN}@northwind.example.com`);
    await salesPage.getByLabel(/^Title$/).fill(`Website for ${leadName}`);
    await salesPage.getByLabel("Line 1 description").fill("Website design and build");
    await salesPage.getByLabel("Line 1 unit price").fill("10000");
    // A monthly care plan: billed every month once the work starts.
    await salesPage.getByRole("button", { name: "Add line" }).click();
    await salesPage.getByLabel("Line 2 description").fill("Website care plan");
    await salesPage.getByLabel("Line 2 unit price").fill("500");
    await salesPage.getByLabel("Line 2 billing").selectOption("monthly");
    await expect(salesPage.getByText("$500.00 / mo").first()).toBeVisible();
    await salesPage.getByLabel("Deposit (% of the total)").fill("30");
    await expect(salesPage.getByRole("checkbox", { name: /start a project/i })).toBeChecked();
    await salesPage.getByRole("button", { name: /create draft/i }).click();
    await salesPage.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);
    const id = salesPage.url().split("/").pop()!;
    await salesPage.getByRole("button", { name: "Send proposal" }).click();
    await salesPage.getByRole("dialog").getByRole("button", { name: "Send proposal" }).click();
    await expect(salesPage.getByRole("heading", { name: "History" })).toBeVisible();

    // The lead opens their portal, reviews the proposal and signs it.
    const lead_ = await asTheLead(browser, portal.url);
    await expect(lead_.page.getByText(/\$10,000\.00 \+ \$500\.00 \/ mo/)).toBeVisible();
    await lead_.page.getByRole("link", { name: "Review & sign" }).click();
    await expect(lead_.page.getByText("Monthly total")).toBeVisible();
    await clickUntilVisible(
      lead_.page.getByRole("button", { name: "Sign this proposal" }),
      lead_.page.getByLabel("Your email"),
    );
    await lead_.page.getByLabel("Your email").fill(`alex+${RUN}@northwind.example.com`);
    await lead_.page.getByRole("checkbox").check();
    await lead_.page.getByRole("button", { name: "Sign proposal" }).click();
    // Signing does the most work of any step (the signature, then accepting
    // it: client, invitation, deposit invoice, signed PDF and emails).
    await expect(lead_.page.getByRole("link", { name: /view the signing certificate/i })).toBeVisible({
      timeout: 30_000,
    });

    // Their portal now points them to their client portal.
    const link = new URL(portal.url);
    await lead_.page.goto(`${link.pathname}${link.search}`);
    await expect(lead_.page.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await lead_.close();

    // On the agency side: a client now, the deposit invoiced, the project waiting on it.
    await salesPage.reload();
    await expect(salesPage.getByRole("heading", { name: "Accepted, waiting on the deposit" })).toBeVisible();
    await expect(salesPage.getByRole("link", { name: leadName })).toBeVisible();
    await expect(salesPage.getByText(/awaiting payment/)).toBeVisible();
    await expect(salesPage.getByText("Project starts when the deposit is paid")).toBeVisible();
    await expect(salesPage.getByText("Monthly billing starts when the deposit is paid")).toBeVisible();

    const { acceptance } = await api(salesPage, "get", `/agencies/${agencyId}/proposals/${id}`);
    await api(salesPage, "post", `/agencies/${agencyId}/invoices/${acceptance.deposit_invoice_id}/payments`, {
      amount_cents: 300000,
      paid_on: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
    });
    await salesPage.reload();
    await expect(salesPage.getByRole("heading", { name: "Accepted and set up" })).toBeVisible();
    await expect(salesPage.getByText(/Monthly billing of \$500\.00 \/ mo/)).toBeVisible();
    await expect(salesPage.getByRole("link", { name: /next invoice/ })).toHaveAttribute("href", "/invoices/recurring");
    await salesPage.getByRole("link", { name: `Website for ${leadName}` }).first().click();
    await expect(salesPage).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
  });
});
