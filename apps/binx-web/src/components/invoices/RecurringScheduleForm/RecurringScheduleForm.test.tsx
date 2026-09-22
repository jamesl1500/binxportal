import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/invoices/recurring/actions", () => ({
  createRecurringScheduleAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { createRecurringScheduleAction } from "@/app/(app)/invoices/recurring/actions";

import RecurringScheduleForm from "./RecurringScheduleForm";

const mockedCreate = vi.mocked(createRecurringScheduleAction);

const clients = [{ id: "c1", name: "Globex" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecurringScheduleForm", () => {
  it("defaults to monthly and shows the day-of-month field", () => {
    render(
      <RecurringScheduleForm
        agencyId="a1"
        clients={clients}
        projects={[]}
        currency="USD"
        defaultDueDays={14}
        defaultTaxRatePercent="0"
      />,
    );
    expect(screen.getByLabelText("Day of month")).toBeInTheDocument();
    expect(screen.queryByLabelText("Weekday")).not.toBeInTheDocument();
  });

  it("switches to the weekday field when weekly is chosen", async () => {
    const user = userEvent.setup();
    render(
      <RecurringScheduleForm
        agencyId="a1"
        clients={clients}
        projects={[]}
        currency="USD"
        defaultDueDays={14}
        defaultTaxRatePercent="0"
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    expect(screen.getByLabelText("Weekday")).toBeInTheDocument();
    expect(screen.queryByLabelText("Day of month")).not.toBeInTheDocument();
  });

  it("won't submit without a title or a described line", () => {
    render(
      <RecurringScheduleForm
        agencyId="a1"
        clients={clients}
        projects={[]}
        currency="USD"
        defaultDueDays={14}
        defaultTaxRatePercent="0"
      />,
    );
    expect(screen.getByRole("button", { name: /create schedule/i })).toBeDisabled();
  });

  it("submits the schedule with a monthly cadence and line items", async () => {
    mockedCreate.mockResolvedValueOnce({ schedule: { id: "s1" } as never });
    const user = userEvent.setup();
    render(
      <RecurringScheduleForm
        agencyId="a1"
        clients={clients}
        projects={[]}
        currency="USD"
        defaultDueDays={14}
        defaultTaxRatePercent="0"
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Monthly retainer");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.selectOptions(screen.getByLabelText("Day of month"), "15");

    await user.click(screen.getByRole("button", { name: /create schedule/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        clientId: "c1",
        title: "Monthly retainer",
        interval: "monthly",
        dayOfMonth: 15,
        weekday: null,
        lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 200000 }],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/invoices/recurring");
  });

  it("submits a weekly cadence with a weekday and no day-of-month", async () => {
    mockedCreate.mockResolvedValueOnce({ schedule: { id: "s1" } as never });
    const user = userEvent.setup();
    render(
      <RecurringScheduleForm
        agencyId="a1"
        clients={clients}
        projects={[]}
        currency="USD"
        defaultDueDays={14}
        defaultTaxRatePercent="0"
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Weekly check-in");
    await user.type(screen.getByLabelText("Line 1 description"), "Check-in");
    await user.type(screen.getByLabelText("Line 1 unit price"), "500");
    await user.click(screen.getByRole("radio", { name: "Weekly" }));
    await user.selectOptions(screen.getByLabelText("Weekday"), "4");

    await user.click(screen.getByRole("button", { name: /create schedule/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ interval: "weekly", weekday: 4, dayOfMonth: null }),
    );
  });
});
