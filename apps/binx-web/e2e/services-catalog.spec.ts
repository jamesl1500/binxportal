/**
 * services-catalog.spec.ts — the services catalog's categories, "starting
 * from" prices and photos, against the real API, and a service's photo
 * travelling onto a draft proposal. Runs as Harbor Lane's owner.
 */
import { clickUntilVisible, expect, test } from "./fixtures";

const RUN = Date.now().toString(36);
// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("services catalog", () => {
  test("a category, a starting price and a photo, then the photo joins a proposal", async ({ salesPage }) => {
    const page = salesPage;
    const category = `Branding ${RUN}`;
    const name = `Brand identity ${RUN}`;

    await page.goto("/settings/services");
    await page.getByLabel("New category").fill(category);
    await clickUntilVisible(
      page.getByRole("button", { name: "Add category" }),
      page.getByLabel(`Rename ${category}`),
    );

    await page.getByRole("button", { name: /add service/i }).first().click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Price (USD)").fill("4000");
    await page.getByRole("combobox", { name: /^Category/ }).selectOption({ label: category });
    await page.getByRole("checkbox", { name: /starting price/i }).check();
    await page.getByRole("button", { name: "Add service" }).last().click();

    const group = page.getByRole("region", { name: category });
    await expect(group.getByText(name)).toBeVisible();
    await expect(group.getByText("From $4,000.00")).toBeVisible();

    // A photo, added while editing.
    await group.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByLabel(`Add photos or PDFs to ${name}`).setInputFiles({
      name: "moodboard.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "moodboard.png" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(group.getByRole("img", { name: "moodboard.png" })).toBeVisible();

    // Picked into a proposal: grouped under its category, priced From, and
    // the photo is attached to the draft.
    await page.goto("/proposals/new");
    const picker = page.getByLabel("Add from services");
    await expect(picker.locator(`optgroup[label="${category}"] option`, { hasText: `${name} · From $4,000.00` })).toHaveCount(1);
    const value = await picker.locator("option", { hasText: name }).getAttribute("value");
    await picker.selectOption(value!);
    await expect(page.getByText("Starting price: set it for this client")).toBeVisible();
    await page.getByLabel("Line 1 unit price").fill("4800");
    await expect(page.getByText("Starting price: set it for this client")).toHaveCount(0);
    await page.getByLabel(/^Title$/).fill(`Identity for Osprey ${RUN}`);
    await page.getByRole("button", { name: /create draft/i }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: /moodboard\.png/ })).toBeVisible();
  });
});
