import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/recurring-invoices", () => ({
  createRecurringSchedule: vi.fn(),
  pauseRecurringSchedule: vi.fn(),
  resumeRecurringSchedule: vi.fn(),
  deleteRecurringSchedule: vi.fn(),
  runRecurringScheduleNow: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { AuthApiError } from "@/lib/auth";
import * as recurring from "@/lib/recurring-invoices";

import {
  createRecurringScheduleAction,
  deleteRecurringScheduleAction,
  pauseRecurringScheduleAction,
  resumeRecurringScheduleAction,
  runRecurringScheduleNowAction,
} from "./actions";

const agencyId = "a1";

const input = {
  clientId: "c1",
  projectId: null,
  title: "Monthly retainer",
  interval: "monthly" as const,
  intervalCount: 1,
  dayOfMonth: 15,
  weekday: null,
  dueDays: 14,
  taxRatePercent: "0",
  notes: null,
  paymentInstructions: null,
  autoIssue: false,
  startDate: null,
  lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 200000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recurring invoices actions", () => {
  it("creates a schedule and revalidates the list", async () => {
    vi.mocked(recurring.createRecurringSchedule).mockResolvedValueOnce({ id: "s1" } as never);
    const result = await createRecurringScheduleAction(agencyId, input);
    expect(result).toEqual({ schedule: { id: "s1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/invoices/recurring");
  });

  it("maps an AuthApiError to its message", async () => {
    vi.mocked(recurring.createRecurringSchedule).mockRejectedValueOnce(
      new AuthApiError("Day of month must be between 1 and 28", 422),
    );
    const result = await createRecurringScheduleAction(agencyId, input);
    expect(result).toEqual({ error: "Day of month must be between 1 and 28" });
  });

  it("falls back to a generic message for an unknown error", async () => {
    vi.mocked(recurring.createRecurringSchedule).mockRejectedValueOnce(new Error("boom"));
    const result = await createRecurringScheduleAction(agencyId, input);
    expect(result).toEqual({ error: "Unable to create recurring invoice schedule" });
  });

  it("pauses a schedule", async () => {
    vi.mocked(recurring.pauseRecurringSchedule).mockResolvedValueOnce({ id: "s1", is_active: false } as never);
    const result = await pauseRecurringScheduleAction(agencyId, "s1");
    expect(recurring.pauseRecurringSchedule).toHaveBeenCalledWith(agencyId, "s1");
    expect(result).toEqual({ schedule: { id: "s1", is_active: false } });
    expect(revalidatePath).toHaveBeenCalledWith("/invoices/recurring");
  });

  it("resumes a schedule", async () => {
    vi.mocked(recurring.resumeRecurringSchedule).mockResolvedValueOnce({ id: "s1", is_active: true } as never);
    const result = await resumeRecurringScheduleAction(agencyId, "s1");
    expect(recurring.resumeRecurringSchedule).toHaveBeenCalledWith(agencyId, "s1");
    expect(result).toEqual({ schedule: { id: "s1", is_active: true } });
  });

  it("deletes a schedule", async () => {
    vi.mocked(recurring.deleteRecurringSchedule).mockResolvedValueOnce(undefined);
    const result = await deleteRecurringScheduleAction(agencyId, "s1");
    expect(recurring.deleteRecurringSchedule).toHaveBeenCalledWith(agencyId, "s1");
    expect(result).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith("/invoices/recurring");
  });

  it("propagates a delete error", async () => {
    vi.mocked(recurring.deleteRecurringSchedule).mockRejectedValueOnce(new AuthApiError("Nope", 403));
    const result = await deleteRecurringScheduleAction(agencyId, "s1");
    expect(result).toEqual({ error: "Nope" });
  });

  it("runs a schedule now and revalidates both list pages", async () => {
    vi.mocked(recurring.runRecurringScheduleNow).mockResolvedValueOnce({ id: "inv-1" } as never);
    const result = await runRecurringScheduleNowAction(agencyId, "s1");
    expect(recurring.runRecurringScheduleNow).toHaveBeenCalledWith(agencyId, "s1");
    expect(result).toEqual({ invoice: { id: "inv-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/invoices/recurring");
    expect(revalidatePath).toHaveBeenCalledWith("/invoices");
  });

  it("maps a run-now error", async () => {
    vi.mocked(recurring.runRecurringScheduleNow).mockRejectedValueOnce(new AuthApiError("Schedule is paused", 409));
    const result = await runRecurringScheduleNowAction(agencyId, "s1");
    expect(result).toEqual({ error: "Schedule is paused" });
  });
});
