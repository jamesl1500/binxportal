import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  hourLabel,
  trendLabel,
  type ErrorSummary,
} from "@/lib/admin-errors-client";

import ErrorDashboard from "./ErrorDashboard";

function summary(overrides: Partial<ErrorSummary> = {}): ErrorSummary {
  const start = Date.UTC(2026, 10, 21, 14);
  return {
    generated_at: "2026-11-22T13:30:00Z",
    windows: {
      "1h": { events: 3, issues: 1, users: 1 },
      "12h": { events: 40, issues: 4, users: 12 },
      "24h": { events: 52, issues: 5, users: 17 },
    },
    previous_24h: 26,
    by_source_24h: { api: 30, web: 22 },
    open_issues_24h: 4,
    new_issues_24h: 2,
    hourly: Array.from({ length: 24 }, (_, i) => ({
      hour_start: new Date(start + i * 3_600_000).toISOString(),
      api: i === 23 ? 2 : 1,
      web: i === 23 ? 1 : 0,
      total: i === 23 ? 3 : 1,
    })),
    ...overrides,
  };
}

describe("ErrorDashboard", () => {
  it("shows the last hour, 12 hours and 24 hours", () => {
    render(<ErrorDashboard summary={summary()} />);

    const tile = (label: string) =>
      screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;
    expect(within(tile("Last hour")).getByText("3")).toBeInTheDocument();
    expect(within(tile("Last 12 hours")).getByText("40")).toBeInTheDocument();
    expect(within(tile("Last 24 hours")).getByText("52")).toBeInTheDocument();
    expect(
      within(tile("Last 24 hours")).getByText("5 issues · 17 people"),
    ).toBeInTheDocument();
    expect(
      within(tile("Last 24 hours")).getByText("+100% on the day before"),
    ).toBeInTheDocument();
    expect(within(tile("Open issues")).getByText("4")).toBeInTheDocument();
    // Errors in the last hour are flagged.
    expect(tile("Last hour")).toHaveAttribute("data-hot");
    expect(tile("Last 12 hours")).not.toHaveAttribute("data-hot");
  });

  it("charts errors per hour, with a table fallback", () => {
    render(<ErrorDashboard summary={summary()} />);
    expect(
      screen.getByRole("img", { name: "Errors per hour, last 24 hours" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Web app").nextSibling).toHaveTextContent("22");
    expect(screen.getAllByRole("row")).toHaveLength(25); // header + 24 hours
  });

  it("says so when there's nothing to chart", () => {
    render(
      <ErrorDashboard
        summary={summary({
          windows: {
            "1h": { events: 0, issues: 0, users: 0 },
            "12h": { events: 0, issues: 0, users: 0 },
            "24h": { events: 0, issues: 0, users: 0 },
          },
        })}
      />,
    );
    expect(
      screen.getByText("No errors in the last 24 hours."),
    ).toBeInTheDocument();
  });
});

describe("labels", () => {
  it("formats hours in UTC", () => {
    expect(hourLabel("2026-11-22T09:00:00Z")).toBe("09:00");
  });

  it("describes the trend against the day before", () => {
    expect(trendLabel(10, 0)).toBe("None the day before");
    expect(trendLabel(0, 0)).toBe("None the day before either");
    expect(trendLabel(5, 10)).toBe("−50% on the day before");
    expect(trendLabel(10, 10)).toBe("Same as the day before");
  });
});
