import { describe, expect, it } from "vitest";

import { recurringIntervalLabel, weekdayLabel } from "@/lib/recurring-invoices-client";

describe("recurringIntervalLabel", () => {
  it("labels known intervals and falls back otherwise", () => {
    expect(recurringIntervalLabel("weekly")).toBe("Weekly");
    expect(recurringIntervalLabel("monthly")).toBe("Monthly");
    expect(recurringIntervalLabel("mystery")).toBe("mystery");
  });
});

describe("weekdayLabel", () => {
  it("maps 0-6 to day names and falls back otherwise", () => {
    expect(weekdayLabel(0)).toBe("Monday");
    expect(weekdayLabel(4)).toBe("Friday");
    expect(weekdayLabel(6)).toBe("Sunday");
    expect(weekdayLabel(9)).toBe("9");
  });
});
