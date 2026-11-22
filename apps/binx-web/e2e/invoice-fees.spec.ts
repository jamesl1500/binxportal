/**
 * invoice-fees.spec.ts — the 1.25% fee on invoices clients pay online:
 * staff see what they'll keep (the invoice page and the editor), and the
 * client never sees the agency's fees.
 *
 * The seeded invoice is $9,250.00, issued and unpaid:
 *   Binx 1.25%          = $115.63 (115.625, rounded half-up)
 *   Stripe 2.9% + 30¢   ≈ $268.55
 *   The agency keeps    ≈ $8,865.82
 */
import { test, expect } from "./fixtures";

test.describe("invoice payment fees", () => {
  test("staff see the fees and take-home on an unpaid invoice", async ({ staffPage }) => {
    await staffPage.goto("/invoices");
    await staffPage.getByRole("link", { name: /INV-0001/ }).first().click();

    const card = staffPage.getByRole("region", { name: "Fees & take-home" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "If your client pays online" })).toBeVisible();
    await expect(card).toContainText("Binx fee (1.25%)−$115.63");
    await expect(card).toContainText("Stripe processing (estimated)−≈ $268.55");
    await expect(card).toContainText("You keep≈ $8,865.82");
  });

  test("the invoice editor previews the take-home as lines are added", async ({ staffPage }) => {
    await staffPage.goto("/invoices/new");
    await staffPage.getByLabel("Line 1 description").fill("Brand identity");
    await staffPage.getByLabel("Line 1 unit price").fill("2500");

    const payout = staffPage.getByLabel("If your client pays online");
    await expect(payout).toContainText("Binx fee (1.25%)−$31.25");
    await expect(payout).toContainText("You keep≈ $2,395.95");
  });

  test("the client portal never shows the agency's fees", async ({ clientPage }) => {
    await clientPage.goto("/portal/invoices");
    await clientPage.getByRole("link", { name: /INV-0001/ }).click();
    await expect(clientPage.getByText("$9,250.00").first()).toBeVisible();
    await expect(clientPage.getByText(/Binx fee|take-home|You keep/)).toHaveCount(0);
  });

  test("pricing states the fee next to every plan", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("+ 1.25% per invoice paid online")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Plus 1.25% when clients pay online." })).toBeVisible();
  });
});
