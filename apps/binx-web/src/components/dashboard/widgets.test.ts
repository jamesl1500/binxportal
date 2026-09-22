import { describe, expect, it } from "vitest";

import { DASHBOARD_WIDGET_IDS, isDashboardWidgetId, normalizeWidgetOrder } from "./widgets";

describe("isDashboardWidgetId", () => {
  it("accepts every known widget id", () => {
    for (const id of DASHBOARD_WIDGET_IDS) {
      expect(isDashboardWidgetId(id)).toBe(true);
    }
  });

  it("rejects an unknown id", () => {
    expect(isDashboardWidgetId("not_a_widget")).toBe(false);
  });
});

describe("normalizeWidgetOrder", () => {
  it("keeps a full, valid order unchanged", () => {
    const order = [...DASHBOARD_WIDGET_IDS].reverse();
    expect(normalizeWidgetOrder(order)).toEqual(order);
  });

  it("drops unknown ids and appends missing ones at the end", () => {
    const result = normalizeWidgetOrder(["quick_actions", "no_longer_exists"]);
    expect(result[0]).toBe("quick_actions");
    expect(new Set(result)).toEqual(new Set(DASHBOARD_WIDGET_IDS));
    expect(result).toHaveLength(DASHBOARD_WIDGET_IDS.length);
  });

  it("returns the default order for an empty input", () => {
    expect(normalizeWidgetOrder([])).toEqual(DASHBOARD_WIDGET_IDS);
  });
});
