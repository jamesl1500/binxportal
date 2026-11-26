import { describe, expect, it } from "vitest";

import {
  billingSuffix,
  proposalPriceLabel,
  proposalStatusLabel,
  proposalTotalRows,
} from "@/lib/proposals-client";

describe("proposalStatusLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["sent", "Sent"],
    ["viewed", "Viewed"],
    ["signed", "Signed"],
    ["declined", "Declined"],
    ["expired", "Expired"],
  ])("labels %s as %s", (status, label) => {
    expect(proposalStatusLabel(status)).toBe(label);
  });

  it("falls back to the raw value for an unknown status", () => {
    expect(proposalStatusLabel("mystery")).toBe("mystery");
  });
});

describe("proposalTotalRows", () => {
  const base = {
    tax_rate_percent: "10.000",
    subtotal_cents: 100000,
    tax_cents: 10000,
    total_cents: 110000,
  };

  it("lists the one-time totals alone when there are no monthly lines", () => {
    expect(proposalTotalRows(base).map((row) => row.label)).toEqual([
      "Subtotal",
      "Tax (10%)",
      "Total",
    ]);
  });

  it("adds the per-month totals for monthly lines", () => {
    const rows = proposalTotalRows({
      ...base,
      monthly_subtotal_cents: 250000,
      monthly_tax_cents: 25000,
      monthly_total_cents: 275000,
    });
    expect(
      rows.map((row) => [row.label, row.cents, row.perMonth, row.grand]),
    ).toEqual([
      ["Subtotal", 100000, false, false],
      ["Tax (10%)", 10000, false, false],
      ["Total", 110000, false, true],
      ["Monthly", 250000, true, false],
      ["Tax (10%)", 25000, true, false],
      ["Monthly total", 275000, true, true],
    ]);
  });

  it("leaves out the one-time block when every line is monthly", () => {
    const rows = proposalTotalRows({
      tax_rate_percent: "0",
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      monthly_subtotal_cents: 250000,
      monthly_tax_cents: 0,
      monthly_total_cents: 250000,
    });
    expect(rows.map((row) => row.label)).toEqual(["Monthly", "Monthly total"]);
  });
});

describe("proposalPriceLabel", () => {
  const format = (cents: number) => `$${cents / 100}`;

  it("reads as the total, the total plus a monthly amount, or the monthly amount alone", () => {
    expect(proposalPriceLabel({ total_cents: 1000 }, format)).toBe("$10");
    expect(
      proposalPriceLabel(
        { total_cents: 1000, monthly_total_cents: 500 },
        format,
      ),
    ).toBe("$10 + $5 / mo");
    expect(
      proposalPriceLabel({ total_cents: 0, monthly_total_cents: 500 }, format),
    ).toBe("$5 / mo");
  });
});

describe("billingSuffix", () => {
  it("marks monthly lines only", () => {
    expect(billingSuffix("monthly")).toBe(" / mo");
    expect(billingSuffix("one_time")).toBe("");
    expect(billingSuffix(undefined)).toBe("");
  });
});
