/**
 * data-transfer.spec.ts — the Import & export page (/data) against the real
 * API: downloads come back as real CSV / Excel files, and imports run through
 * the wizard end to end, then show up in an export (the round trip the page
 * promises: "exported files use the same columns the importer reads").
 */
import fs from "node:fs";

import type { Page } from "@playwright/test";

import { DEMO, expect, test } from "./fixtures";

async function download(page: Page, linkName: string) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: linkName }).click(),
  ]);
  const filePath = await file.path();
  return { name: file.suggestedFilename(), bytes: fs.readFileSync(filePath) };
}

async function importCsv(page: Page, kind: string, noun: string, csv: string[]) {
  await page.goto(`/data/import/${kind}`);
  await page
    .getByLabel(`Upload a ${noun} spreadsheet`)
    .setInputFiles({ name: `${kind}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv.join("\n")) });
  await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible();
  await page.getByRole("button", { name: "Review rows" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
}

test.describe("import & export", () => {
  test("the page lists every kind; invoices and proposals are export-only", async ({ staffPage }) => {
    await staffPage.goto("/data");
    await expect(staffPage.getByRole("heading", { level: 1, name: "Import & export" })).toBeVisible();
    for (const label of ["Clients", "Team", "Leads", "Projects", "Tasks", "Time entries", "Services", "Invoices", "Proposals"]) {
      await expect(staffPage.getByRole("heading", { level: 2, name: label, exact: true })).toBeVisible();
    }
    await expect(staffPage.getByRole("link", { name: "Import invoices" })).toHaveCount(0);
    await expect(staffPage.getByText("Export only")).toHaveCount(2);
  });

  test("exports download as real CSV and Excel files", async ({ staffPage }) => {
    await staffPage.goto("/data");

    const csv = await download(staffPage, "CSV export of clients");
    expect(csv.name).toMatch(/\.csv$/);
    const text = csv.bytes.toString("utf8");
    expect(text.split(/\r?\n/)[0]).toContain("Client name");
    expect(text).toContain(DEMO.clientName);

    const xlsx = await download(staffPage, "Excel export of invoices");
    expect(xlsx.name).toMatch(/\.xlsx$/);
    expect(xlsx.bytes.subarray(0, 2).toString("latin1")).toBe("PK"); // a zip, i.e. a real workbook
  });

  test("leads import through the wizard and come back out in the export", async ({ staffPage }) => {
    await importCsv(staffPage, "leads", "leads", [
      "Name,Contact email,Estimated value,Status",
      "Lighthouse Bakery,owner@lighthouse.example.com,\"$4,500\",new",
      "=1+2,,,", // a formula-looking name is imported as plain text
    ]);
    await staffPage.getByRole("button", { name: "Import 2 leads" }).click();
    await expect(staffPage.getByRole("heading", { name: "Imported 2 leads" })).toBeVisible();

    await staffPage.goto("/data");
    const text = (await download(staffPage, "CSV export of leads")).bytes.toString("utf8");
    expect(text).toContain("Lighthouse Bakery");
    expect(text).toContain("4500.00");
    // Re-guarded on the way out, so a spreadsheet app won't run it.
    expect(text).toContain("'=1+2");
  });

  test("tasks import onto the project board", async ({ staffPage }) => {
    await importCsv(staffPage, "tasks", "tasks", [
      "Project,Title,Column,Due date",
      `${DEMO.projectName},Imported launch checklist,To do,2026-12-01`,
      "No Such Project,Orphan task,,",
    ]);
    await staffPage.getByRole("button", { name: "Import 1 task" }).click();
    await expect(staffPage.getByRole("heading", { name: "Imported 1 task" })).toBeVisible();

    await staffPage.goto("/projects");
    await staffPage.getByRole("link", { name: DEMO.projectName }).click();
    await staffPage
      .getByRole("navigation", { name: "Project" })
      .getByRole("link", { name: "Board", exact: true })
      .click();
    await expect(staffPage.getByText("Imported launch checklist")).toBeVisible();
  });

  test("time entries import and appear in the time export", async ({ staffPage }) => {
    await importCsv(staffPage, "time_entries", "time entries", [
      "Date,Hours,Project,Description",
      `2026-11-02,1:30,${DEMO.projectName},Imported design review`,
    ]);
    await staffPage.getByRole("button", { name: "Import 1 time entry" }).click();
    await expect(staffPage.getByRole("heading", { name: "Imported 1 time entry" })).toBeVisible();

    await staffPage.goto("/data");
    const text = (await download(staffPage, "CSV export of time entries")).bytes.toString("utf8");
    expect(text).toContain("Imported design review");
  });
});
