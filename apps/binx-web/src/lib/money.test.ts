import { describe, expect, it } from "vitest";

import { deriveDisplayStatus, formatMoneyCents, invoiceStatusLabel } from "./money";

describe("money", () => {
  it("formats cents as currency", () => {
    expect(formatMoneyCents(342563, "USD")).toBe("$3,425.63");
    expect(formatMoneyCents(0, "USD")).toBe("$0.00");
  });

  it("falls back for a malformed currency code", () => {
    expect(formatMoneyCents(10000, "US")).toBe("100.00 US");
  });

  it("labels statuses", () => {
    expect(invoiceStatusLabel("partial")).toBe("Partially paid");
    expect(invoiceStatusLabel("weird")).toBe("weird");
  });

  describe("deriveDisplayStatus", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    it("passes draft / paid / void through unchanged", () => {
      expect(
        deriveDisplayStatus({ status: "draft", due_date: yesterday, total_cents: 100, amount_paid_cents: 0 }),
      ).toBe("draft");
      expect(
        deriveDisplayStatus({ status: "void", due_date: yesterday, total_cents: 100, amount_paid_cents: 0 }),
      ).toBe("void");
    });

    it("marks a past-due unpaid sent invoice overdue", () => {
      expect(
        deriveDisplayStatus({ status: "sent", due_date: yesterday, total_cents: 100, amount_paid_cents: 0 }),
      ).toBe("overdue");
    });

    it("marks a part-paid sent invoice partial", () => {
      expect(
        deriveDisplayStatus({ status: "sent", due_date: tomorrow, total_cents: 100, amount_paid_cents: 40 }),
      ).toBe("partial");
    });

    it("leaves an on-time unpaid sent invoice as sent", () => {
      expect(
        deriveDisplayStatus({ status: "sent", due_date: tomorrow, total_cents: 100, amount_paid_cents: 0 }),
      ).toBe("sent");
    });
  });
});
