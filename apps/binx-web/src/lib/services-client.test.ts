import { describe, expect, it } from "vitest";

import { groupServices, serviceAttachmentHref, servicePriceLabel } from "@/lib/services-client";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

describe("services-client", () => {
  it("labels a price, with From for a starting price", () => {
    expect(servicePriceLabel({ unit_price_cents: 250000, pricing_type: "fixed", is_starting_price: false }, money)).toBe(
      "$2500.00",
    );
    expect(servicePriceLabel({ unit_price_cents: 50000, pricing_type: "monthly", is_starting_price: true }, money)).toBe(
      "From $500.00 / mo",
    );
    expect(servicePriceLabel({ unit_price_cents: 15000, pricing_type: "hourly", is_starting_price: true }, money)).toBe(
      "From $150.00 / hr",
    );
  });

  it("groups services by category in category order, uncategorised and unknown last", () => {
    const services = [
      { id: "a", category_id: null, category_name: null },
      { id: "b", category_id: "c2", category_name: "Web" },
      { id: "c", category_id: "c1", category_name: "Branding" },
      { id: "d", category_id: "gone", category_name: null },
    ];
    const groups = groupServices(services, [
      { id: "c1", name: "Branding" },
      { id: "c2", name: "Web" },
      { id: "c3", name: "Empty" },
    ]);
    expect(groups.map((g) => [g.name, g.services.map((s) => s.id)])).toEqual([
      ["Branding", ["c"]],
      ["Web", ["b"]],
      [null, ["a", "d"]],
    ]);
  });

  it("points at the web app's file proxy", () => {
    expect(serviceAttachmentHref("a1", "s1", "f1")).toBe("/api/services/a1/s1/attachments/f1");
    expect(serviceAttachmentHref("a1", "s1", "f1", { inline: true })).toBe(
      "/api/services/a1/s1/attachments/f1?inline=1",
    );
  });
});
