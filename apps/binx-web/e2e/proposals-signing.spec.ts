/**
 * proposals-signing.spec.ts — the services catalog and the proposal signing
 * flow against the real API: build a proposal from catalog services, attach
 * a document, send it, sign it (client portal and share link, with e-sign
 * consent), countersign it for the agency, and read the signed record (the
 * certificate page, its PDF, and the proposal's history).
 *
 * Names carry a per-run suffix: the suite runs in parallel and the seed only
 * resets the demo agency between runs, not between tests.
 */
import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import { AUTH_DIR, DEMO, expect, test } from "./fixtures";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";
const RUN = Date.now().toString(36);

/** The staff session's bearer token, for the few reads the UI doesn't surface (the share URL). */
function staffToken(): string {
  const state = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "staff.json"), "utf8"));
  return state.cookies.find((c: { name: string }) => c.name === "binx_access_token").value;
}

async function apiGet(page: Page, url: string) {
  const res = await page.request.get(`${API_URL}${url}`, { headers: { Authorization: `Bearer ${staffToken()}` } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function addService(page: Page, name: string, pricing: string, price: string, description = "") {
  await page.goto("/settings/services");
  await page.getByRole("button", { name: "Add service" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Pricing").selectOption(pricing);
  await page.getByLabel(/^Price/).fill(price);
  if (description) await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Add service" }).last().click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function pickService(page: Page, name: string) {
  const select = page.getByLabel("Add from services");
  const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
  await select.selectOption(value!);
}

/** Drafts a proposal from one catalog service and returns its id. */
async function draftFromService(
  page: Page,
  { title, service, client, countersign }: { title: string; service: string; client?: string; countersign?: boolean },
): Promise<string> {
  await page.goto("/proposals/new");
  // The <label> wraps the <select>, so its accessible name includes the
  // option text; find the select inside the "Client" label instead.
  if (client) await page.locator("label", { hasText: /^Client/ }).locator("select").selectOption({ label: client });
  await page.getByLabel(/^Title$/).fill(title);
  await page.getByLabel("Recipient name").fill("Jane Prospect");
  await page.getByLabel("Recipient email").fill(`jane+${RUN}@fjordandfield.example.com`);
  await pickService(page, service);
  if (countersign) await page.getByRole("checkbox", { name: /require our countersignature/i }).check();
  await page.getByRole("button", { name: /create draft/i }).click();
  await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

async function send(page: Page) {
  await page.getByRole("button", { name: "Send proposal" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send proposal" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
}

// Each test walks several pages (and, on a dev server, compiles each route on
// first visit), so they get more than the suite's 30s default.
test.describe.configure({ timeout: 120_000 });

test.describe("services catalog", () => {
  test("add a service and pick it on a proposal, invoice and recurring schedule", async ({ staffPage }) => {
    const name = `Retainer ${RUN}`;
    await addService(staffPage, name, "monthly", "2000", "Up to 20 hours of design a month.");
    await expect(staffPage.getByText("$2,000.00 / mo").first()).toBeVisible();

    await staffPage.goto("/proposals/new");
    await pickService(staffPage, name);
    await expect(staffPage.getByLabel("Line 1 description")).toHaveValue(name);
    await expect(staffPage.getByLabel("Line 1 details")).toHaveValue("Up to 20 hours of design a month.");
    await expect(staffPage.getByLabel("Line 1 unit price")).toHaveValue("2000.00");

    await staffPage.goto("/invoices/new");
    await pickService(staffPage, name);
    await expect(staffPage.getByLabel("Line 1 description")).toHaveValue(name);

    await staffPage.goto("/invoices/recurring/new");
    await pickService(staffPage, name);
    await expect(staffPage.getByLabel("Line 1 unit price")).toHaveValue("2000.00");
  });

  test("import services from a spreadsheet, then export them", async ({ staffPage }) => {
    await staffPage.goto("/data/import/services");
    await staffPage.getByLabel("Upload a services spreadsheet").setInputFiles({
      name: "services.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Service name,Pricing,Price,Description",
          `Strategy ${RUN},Flat fee,"$5,000",Workshops`,
          `Dev hours ${RUN},per hour,150,`,
          `Bad ${RUN},weekly,10,`,
        ].join("\n"),
      ),
    });
    await expect(staffPage.getByRole("heading", { name: "Match your columns" })).toBeVisible();
    await staffPage.getByRole("button", { name: "Review rows" }).click();
    await expect(staffPage.getByText("must be fixed, hourly or monthly")).toBeVisible();
    await staffPage.getByRole("button", { name: "Import 2 services" }).click();
    await expect(staffPage.getByText("Imported 2 services")).toBeVisible();

    await staffPage.goto("/settings/services");
    await expect(staffPage.getByText(`Strategy ${RUN}`, { exact: true })).toBeVisible();
    await expect(staffPage.getByText("$150.00 / hr").first()).toBeVisible();

    const agency = (await apiGet(staffPage, "/agencies/mine")).find((a: { name: string }) => a.name === DEMO.agency);
    const exported = await staffPage.request.get(`/api/agencies/${agency.id}/exports/services?format=csv`);
    expect(exported.ok()).toBeTruthy();
    expect(await exported.text()).toContain(`Strategy ${RUN}`);
  });
});

test.describe("proposal signing", () => {
  test("client signs in the portal, the agency countersigns, both see the signed record", async ({
    staffPage,
    clientPage,
  }) => {
    const service = `Brand sprint ${RUN}`;
    await addService(staffPage, service, "fixed", "8000", "Two-week brand sprint.");
    const title = `Brand sprint for ${DEMO.clientName} ${RUN}`;
    const id = await draftFromService(staffPage, { title, service, client: DEMO.clientName, countersign: true });

    // A document travels with the proposal.
    await staffPage.getByLabel(/attach files/i).setInputFiles({
      name: "Statement of work.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 statement of work"),
    });
    await expect(staffPage.getByRole("link", { name: /Statement of work\.pdf/ })).toBeVisible();
    await send(staffPage);

    // The client signs in their portal, after consenting.
    await clientPage.goto(`/portal/proposals/${id}`);
    await expect(clientPage.getByRole("link", { name: /Statement of work\.pdf/ })).toBeVisible();
    await expect(clientPage.getByText("Two-week brand sprint.")).toBeVisible();
    await clientPage.getByRole("button", { name: "Sign this proposal" }).click();
    const sign = clientPage.getByRole("button", { name: "Sign proposal" });
    await expect(sign).toBeDisabled();
    await clientPage.getByRole("checkbox").check();
    await sign.click();
    await expect(clientPage.getByText("Awaiting the agency's countersignature.")).toBeVisible();

    // The agency countersigns.
    await staffPage.goto(`/proposals/${id}`);
    await expect(staffPage.getByRole("heading", { name: "Ready for your countersignature" })).toBeVisible();
    await staffPage.getByRole("checkbox").check();
    await staffPage.getByRole("button", { name: "Countersign proposal" }).click();
    await expect(staffPage.getByText(/Countersigned by .* for the/)).toBeVisible();
    const history = staffPage.getByRole("heading", { name: "History" }).locator("xpath=../..");
    for (const event of ["Sent", "Opened", "Signed", "countersigned"]) {
      await expect(history.getByText(event, { exact: false }).first()).toBeVisible();
    }

    // The signed record: the staff certificate and its PDF...
    await staffPage.getByRole("link", { name: /view the signing certificate/i }).click();
    await expect(staffPage.getByText("The signed record matches its fingerprint.")).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "Agency countersignature" })).toBeVisible();
    const pdfHref = await staffPage.getByRole("link", { name: /download pdf/i }).getAttribute("href");
    const staffPdf = await staffPage.request.get(pdfHref!);
    expect(staffPdf.headers()["content-type"]).toBe("application/pdf");
    expect((await staffPdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // ...and the client's, from the portal.
    await clientPage.goto(`/portal/proposals/${id}`);
    await clientPage.getByRole("link", { name: /view the signing certificate/i }).click();
    await expect(clientPage.getByRole("heading", { name: "Client signature" })).toBeVisible();
    await expect(clientPage.getByText("Client portal (signed-in account)")).toBeVisible();
    const portalPdf = await clientPage.request.get(`/api/portal/proposals/${id}/certificate`);
    expect(portalPdf.headers()["content-type"]).toBe("application/pdf");
  });

  test("a recipient without an account signs from the share link", async ({ staffPage, browser }) => {
    const service = `Audit ${RUN}`;
    await addService(staffPage, service, "fixed", "1500");
    const id = await draftFromService(staffPage, { title: `Site audit ${RUN}`, service });
    await send(staffPage);

    const agencyId = (await apiGet(staffPage, "/agencies/mine")).find(
      (a: { name: string }) => a.name === DEMO.agency,
    ).id;
    const { share_url: shareUrl } = await apiGet(staffPage, `/agencies/${agencyId}/proposals/${id}`);
    const shareLink = new URL(shareUrl);

    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await page.goto(`${shareLink.pathname}${shareLink.search}`);
    await page.getByRole("button", { name: "Sign this proposal" }).click();
    await page.getByLabel("Your email").fill(`jane+${RUN}@fjordandfield.example.com`);
    await expect(page.getByText(/You're signing document/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign proposal" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Sign proposal" }).click();

    await page.getByRole("link", { name: /view the signing certificate/i }).click();
    await expect(page.getByText("The signed record matches its fingerprint.")).toBeVisible();
    await expect(page.getByText("Share link sent to the recipient")).toBeVisible();
    const pdfHref = await page.getByRole("link", { name: /download pdf/i }).getAttribute("href");
    const pdf = await page.request.get(pdfHref!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    await visitor.close();
  });
});
