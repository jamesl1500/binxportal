import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import * as recurring from "@/lib/recurring-invoices";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const S = "schedule-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

const scheduleInput: recurring.RecurringScheduleInput = {
  clientId: "client-1",
  projectId: null,
  title: "Monthly retainer",
  interval: "monthly",
  intervalCount: 1,
  dayOfMonth: 1,
  weekday: null,
  dueDays: 14,
  taxRatePercent: "0",
  notes: null,
  paymentInstructions: null,
  autoIssue: false,
  startDate: null,
  lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 500_000 }],
};

describe("recurring-invoices.ts", () => {
  it("getRecurringSchedules GETs the list, optionally scoped to a client", async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    await recurring.getRecurringSchedules(A);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/recurring-invoices`, { ...AUTH, params: undefined });

    await recurring.getRecurringSchedules(A, "client-1");
    expect(mockedApi.get).toHaveBeenLastCalledWith(`/agencies/${A}/recurring-invoices`, {
      ...AUTH,
      params: { client_id: "client-1" },
    });
  });

  it("createRecurringSchedule POSTs a mapped line-item payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: S } });
    await recurring.createRecurringSchedule(A, scheduleInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/recurring-invoices`,
      expect.objectContaining({
        client_id: "client-1",
        interval: "monthly",
        day_of_month: 1,
        line_items: [{ description: "Retainer", quantity: "1", unit_price_cents: 500_000 }],
      }),
      AUTH,
    );
  });

  it("updateRecurringSchedule PATCHes the schedule", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: S } });
    await recurring.updateRecurringSchedule(A, S, scheduleInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/recurring-invoices/${S}`,
      expect.objectContaining({ title: "Monthly retainer" }),
      AUTH,
    );
  });

  it("pauseRecurringSchedule POSTs a null body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: S, is_active: false } });
    await recurring.pauseRecurringSchedule(A, S);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/recurring-invoices/${S}/pause`, null, AUTH);
  });

  it("resumeRecurringSchedule POSTs a null body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: S, is_active: true } });
    await recurring.resumeRecurringSchedule(A, S);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/recurring-invoices/${S}/resume`, null, AUTH);
  });

  it("deleteRecurringSchedule DELETEs the schedule", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await recurring.deleteRecurringSchedule(A, S);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/recurring-invoices/${S}`, AUTH);
  });

  it("runRecurringScheduleNow POSTs a null body and returns the generated invoice", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "invoice-1" } });
    const res = await recurring.runRecurringScheduleNow(A, S);
    expect(res).toEqual({ id: "invoice-1" });
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/recurring-invoices/${S}/run-now`, null, AUTH);
  });

  describe("error handling", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(403, "Nope"));
      await expect(recurring.getRecurringSchedules(A)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 403,
        message: "Nope",
      });
    });

    it.each([
      ["getRecurringSchedules", () => recurring.getRecurringSchedules(A)],
      ["createRecurringSchedule", () => recurring.createRecurringSchedule(A, scheduleInput)],
      ["updateRecurringSchedule", () => recurring.updateRecurringSchedule(A, S, scheduleInput)],
      ["pauseRecurringSchedule", () => recurring.pauseRecurringSchedule(A, S)],
      ["resumeRecurringSchedule", () => recurring.resumeRecurringSchedule(A, S)],
      ["deleteRecurringSchedule", () => recurring.deleteRecurringSchedule(A, S)],
      ["runRecurringScheduleNow", () => recurring.runRecurringScheduleNow(A, S)],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
