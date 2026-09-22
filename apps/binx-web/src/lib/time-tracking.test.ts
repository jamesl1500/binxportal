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
import * as timeTracking from "@/lib/time-tracking";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const E = "entry-1";
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

const startInput: timeTracking.StartTimerInput = {
  projectId: "project-1",
  taskId: "task-1",
  description: "Working on the thing",
  isBillable: true,
};

const manualInput: timeTracking.ManualEntryInput = {
  projectId: "project-1",
  taskId: null,
  description: "Backfilled entry",
  startedAt: "2026-01-01T09:00:00Z",
  endedAt: "2026-01-01T10:00:00Z",
  isBillable: true,
  hourlyRateCents: 15000,
};

const updateInput: timeTracking.TimeEntryUpdateInput = {
  description: "Updated",
  taskId: null,
  isBillable: false,
  hourlyRateCents: null,
  startedAt: null,
  endedAt: null,
};

describe("time-tracking.ts", () => {
  it("getRunningTimer GETs the running endpoint", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: null });
    expect(await timeTracking.getRunningTimer(A)).toBeNull();
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/time-entries/running`, AUTH);
  });

  it("startTimer POSTs a mapped payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: E } });
    await timeTracking.startTimer(A, startInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/time-entries/start`,
      { project_id: "project-1", task_id: "task-1", description: "Working on the thing", is_billable: true },
      AUTH,
    );
  });

  it("stopTimer POSTs a null body to the stop endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: E, ended_at: "2026-01-01T10:00:00Z" } });
    await timeTracking.stopTimer(A, E);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/time-entries/${E}/stop`, null, AUTH);
  });

  it("logManualEntry POSTs a mapped payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: E } });
    await timeTracking.logManualEntry(A, manualInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/time-entries`,
      expect.objectContaining({
        project_id: "project-1",
        started_at: "2026-01-01T09:00:00Z",
        ended_at: "2026-01-01T10:00:00Z",
        hourly_rate_cents: 15000,
      }),
      AUTH,
    );
  });

  it("updateTimeEntry PATCHes the entry", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: E } });
    await timeTracking.updateTimeEntry(A, E, updateInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/time-entries/${E}`,
      expect.objectContaining({ description: "Updated", is_billable: false }),
      AUTH,
    );
  });

  it("deleteTimeEntry DELETEs the entry", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await timeTracking.deleteTimeEntry(A, E);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/time-entries/${E}`, AUTH);
  });

  it("getTimeEntries passes the filter through as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await timeTracking.getTimeEntries(A, { projectId: "p1", billable: true, uninvoiced: true });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/time-entries`, {
      ...AUTH,
      params: { project_id: "p1", task_id: undefined, user_id: undefined, billable: true, uninvoiced: true },
    });
  });

  it("getUninvoicedSummary scopes to a project", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { entry_count: 3 } });
    const res = await timeTracking.getUninvoicedSummary(A, "project-1");
    expect(res).toEqual({ entry_count: 3 });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/time-entries/uninvoiced-summary`, {
      ...AUTH,
      params: { project_id: "project-1" },
    });
  });

  it("createInvoiceFromTimeEntries POSTs the client/project/entry ids", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "invoice-1" } });
    await timeTracking.createInvoiceFromTimeEntries(A, "client-1", "project-1", [E, "entry-2"]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/invoices/from-time-entries`,
      { client_id: "client-1", project_id: "project-1", entry_ids: [E, "entry-2"] },
      AUTH,
    );
  });

  describe("error handling", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(409, "Already running"));
      await expect(timeTracking.getRunningTimer(A)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 409,
        message: "Already running",
      });
    });

    it.each([
      ["getRunningTimer", () => timeTracking.getRunningTimer(A)],
      ["startTimer", () => timeTracking.startTimer(A, startInput)],
      ["stopTimer", () => timeTracking.stopTimer(A, E)],
      ["logManualEntry", () => timeTracking.logManualEntry(A, manualInput)],
      ["updateTimeEntry", () => timeTracking.updateTimeEntry(A, E, updateInput)],
      ["deleteTimeEntry", () => timeTracking.deleteTimeEntry(A, E)],
      ["getTimeEntries", () => timeTracking.getTimeEntries(A)],
      ["getUninvoicedSummary", () => timeTracking.getUninvoicedSummary(A, "project-1")],
      ["createInvoiceFromTimeEntries", () => timeTracking.createInvoiceFromTimeEntries(A, "c1", "p1", [E])],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});
