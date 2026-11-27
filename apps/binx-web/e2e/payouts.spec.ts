/**
 * payouts.spec.ts — Settings → Payouts against the real API. The seeded
 * agency hasn't connected Stripe, so this covers the page, the tab and the
 * "connect Stripe first" state; the embedded Stripe component itself is Stripe's,
 * and its session is covered by binx-api's tests.
 */
import { expect, test } from "./fixtures";

test.describe("payouts", () => {
  test("owners find payouts in settings, and are sent to connect Stripe first", async ({ salesPage }) => {
    await salesPage.goto("/settings/invoicing");
    await salesPage.getByRole("navigation", { name: "Agency settings" }).getByRole("link", { name: "Payouts" }).click();
    await expect(salesPage).toHaveURL(/\/settings\/payouts$/);
    await expect(salesPage.getByRole("heading", { name: "Payouts" })).toBeVisible();
    await expect(salesPage.getByText(/Connect Stripe on the/)).toBeVisible();
    await salesPage.getByRole("link", { name: "Invoicing" }).last().click();
    await expect(salesPage).toHaveURL(/\/settings\/invoicing$/);
  });
});
