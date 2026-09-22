import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/invoices/RecurringScheduleActions/RecurringScheduleActions", () => ({
  default: () => <div>actions</div>,
}));

import type { RecurringSchedule } from "@/lib/recurring-invoices";

import RecurringSchedulesTable, { cadenceLabel } from "./RecurringSchedulesTable";

function makeSchedule(overrides: Partial<RecurringSchedule> = {}): RecurringSchedule {
  return {
    id: "s1",
    agency_id: "a1",
    client_id: "c1",
    client_name: "Globex",
    project_id: null,
    project_name: null,
    title: "Monthly retainer",
    interval: "monthly",
    interval_count: 1,
    day_of_month: 15,
    weekday: null,
    due_days: 14,
    tax_rate_percent: "0",
    auto_issue: false,
    is_active: true,
    next_run_date: "2026-10-15",
    last_run_at: null,
    last_generated_invoice_id: null,
    line_items: [],
    estimated_amount_cents: 200000,
    ...overrides,
  } as RecurringSchedule;
}

describe("cadenceLabel", () => {
  it("describes a monthly schedule", () => {
    expect(cadenceLabel(makeSchedule({ interval: "monthly", day_of_month: 15, interval_count: 1 }))).toBe(
      "Monthly on the 15th",
    );
  });

  it("describes a weekly schedule", () => {
    expect(cadenceLabel(makeSchedule({ interval: "weekly", weekday: 4, day_of_month: null, interval_count: 1 }))).toBe(
      "Weekly on Friday",
    );
  });

  it("describes a multi-interval schedule", () => {
    expect(
      cadenceLabel(makeSchedule({ interval: "weekly", weekday: 0, day_of_month: null, interval_count: 2 })),
    ).toBe("Every 2 weeks on Monday");
  });
});

describe("RecurringSchedulesTable", () => {
  it("shows an empty state with no schedules", () => {
    render(<RecurringSchedulesTable agencyId="a1" schedules={[]} currency="USD" canManage />);
    expect(screen.getByText("No recurring invoices yet.")).toBeInTheDocument();
  });

  it("renders a schedule's title, client, cadence, amount and status", () => {
    render(<RecurringSchedulesTable agencyId="a1" schedules={[makeSchedule()]} currency="USD" canManage />);
    expect(screen.getByText("Monthly retainer")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByText("Monthly on the 15th")).toBeInTheDocument();
    expect(screen.getByText("$2,000.00")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Paused for an inactive schedule", () => {
    render(
      <RecurringSchedulesTable agencyId="a1" schedules={[makeSchedule({ is_active: false })]} currency="USD" canManage />,
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });
});
