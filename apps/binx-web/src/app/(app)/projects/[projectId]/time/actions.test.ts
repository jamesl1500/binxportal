import { beforeEach, describe, expect, it, vi } from "vitest";

// These actions only orchestrate: call the matching lib/time-tracking
// function, translate a thrown AuthApiError into a returned { error }, and
// revalidate the Time subpage. We mock both so these tests prove the
// ORCHESTRATION is correct, without a real network call or cache.
vi.mock("@/lib/time-tracking", () => ({
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  logManualEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
  createInvoiceFromTimeEntries: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Next's real redirect() throws a special "NEXT_REDIRECT" error internally
// that the framework catches further up to actually perform the navigation.
// We mimic that "redirect = throw" behavior with our own sentinel error so we
// can assert on `.rejects.toThrow(...)` instead of needing a full Next runtime.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import {
  createInvoiceFromTimeEntries,
  deleteTimeEntry,
  logManualEntry,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from "@/lib/time-tracking";

import {
  createInvoiceFromTimeEntriesAction,
  deleteTimeEntryAction,
  logManualEntryAction,
  startTimerAction,
  stopTimerAction,
  updateTimeEntryAction,
} from "./actions";

const mockedStartTimer = vi.mocked(startTimer);
const mockedStopTimer = vi.mocked(stopTimer);
const mockedLogManualEntry = vi.mocked(logManualEntry);
const mockedUpdateTimeEntry = vi.mocked(updateTimeEntry);
const mockedDeleteTimeEntry = vi.mocked(deleteTimeEntry);
const mockedCreateInvoiceFromTimeEntries = vi.mocked(createInvoiceFromTimeEntries);
const mockedRevalidatePath = vi.mocked(revalidatePath);
const mockedRedirect = vi.mocked(redirect);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const projectId = "bbbbbbbb-2222-2222-2222-222222222222";
const entry = { id: "entry-1", project_id: projectId } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startTimerAction", () => {
  const input = { projectId, taskId: null, description: null, isBillable: true };

  it("starts the timer and revalidates the time tab", async () => {
    mockedStartTimer.mockResolvedValueOnce(entry);

    await expect(startTimerAction(agencyId, projectId, input)).resolves.toEqual({ entry });

    expect(mockedStartTimer).toHaveBeenCalledWith(agencyId, input);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedStartTimer.mockRejectedValueOnce(
      new AuthApiError("You already have a timer running — stop it before starting another", 409),
    );

    await expect(startTimerAction(agencyId, projectId, input)).resolves.toEqual({
      error: "You already have a timer running — stop it before starting another",
    });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-API error", async () => {
    mockedStartTimer.mockRejectedValueOnce(new Error("boom"));

    await expect(startTimerAction(agencyId, projectId, input)).resolves.toEqual({
      error: "Unable to start the timer",
    });
  });
});

describe("stopTimerAction", () => {
  it("stops the timer and revalidates the time tab", async () => {
    mockedStopTimer.mockResolvedValueOnce(entry);

    await expect(stopTimerAction(agencyId, projectId, "entry-1")).resolves.toEqual({ entry });

    expect(mockedStopTimer).toHaveBeenCalledWith(agencyId, "entry-1");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedStopTimer.mockRejectedValueOnce(new AuthApiError("This timer was already stopped", 409));

    await expect(stopTimerAction(agencyId, projectId, "entry-1")).resolves.toEqual({
      error: "This timer was already stopped",
    });
  });
});

describe("logManualEntryAction", () => {
  const input = {
    projectId,
    taskId: null,
    description: "Client call",
    startedAt: "2026-01-01T09:00:00.000Z",
    endedAt: "2026-01-01T10:00:00.000Z",
    isBillable: true,
    hourlyRateCents: 15000,
  };

  it("logs the entry and revalidates the time tab", async () => {
    mockedLogManualEntry.mockResolvedValueOnce(entry);

    await expect(logManualEntryAction(agencyId, projectId, input)).resolves.toEqual({ entry });

    expect(mockedLogManualEntry).toHaveBeenCalledWith(agencyId, input);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedLogManualEntry.mockRejectedValueOnce(new AuthApiError("ended_at must be after started_at", 400));

    await expect(logManualEntryAction(agencyId, projectId, input)).resolves.toEqual({
      error: "ended_at must be after started_at",
    });
  });
});

describe("updateTimeEntryAction", () => {
  const input = {
    description: "Updated",
    taskId: null,
    isBillable: false,
    hourlyRateCents: null,
    startedAt: null,
    endedAt: null,
  };

  it("updates the entry and revalidates the time tab", async () => {
    mockedUpdateTimeEntry.mockResolvedValueOnce(entry);

    await expect(updateTimeEntryAction(agencyId, projectId, "entry-1", input)).resolves.toEqual({ entry });

    expect(mockedUpdateTimeEntry).toHaveBeenCalledWith(agencyId, "entry-1", input);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedUpdateTimeEntry.mockRejectedValueOnce(
      new AuthApiError("This entry has already been billed onto an invoice", 409),
    );

    await expect(updateTimeEntryAction(agencyId, projectId, "entry-1", input)).resolves.toEqual({
      error: "This entry has already been billed onto an invoice",
    });
  });
});

describe("deleteTimeEntryAction", () => {
  it("deletes the entry and revalidates the time tab", async () => {
    mockedDeleteTimeEntry.mockResolvedValueOnce(undefined);

    await expect(deleteTimeEntryAction(agencyId, projectId, "entry-1")).resolves.toEqual({});

    expect(mockedDeleteTimeEntry).toHaveBeenCalledWith(agencyId, "entry-1");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedDeleteTimeEntry.mockRejectedValueOnce(
      new AuthApiError("This entry has already been billed onto an invoice", 409),
    );

    await expect(deleteTimeEntryAction(agencyId, projectId, "entry-1")).resolves.toEqual({
      error: "This entry has already been billed onto an invoice",
    });
  });
});

describe("createInvoiceFromTimeEntriesAction", () => {
  const clientId = "cccccccc-3333-3333-3333-333333333333";
  const entryIds = ["entry-1", "entry-2"];

  it("creates the invoice, revalidates the time tab, and redirects to it", async () => {
    mockedCreateInvoiceFromTimeEntries.mockResolvedValueOnce({ id: "invoice-1" } as never);

    await expect(
      createInvoiceFromTimeEntriesAction(agencyId, clientId, projectId, entryIds),
    ).rejects.toThrow("REDIRECT:/invoices/invoice-1");

    expect(mockedCreateInvoiceFromTimeEntries).toHaveBeenCalledWith(agencyId, clientId, projectId, entryIds);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/projects/${projectId}/time`);
    expect(mockedRedirect).toHaveBeenCalledWith("/invoices/invoice-1");
  });

  it("returns the upstream error message without redirecting", async () => {
    mockedCreateInvoiceFromTimeEntries.mockRejectedValueOnce(
      new AuthApiError("One or more entries have already been invoiced", 409),
    );

    await expect(createInvoiceFromTimeEntriesAction(agencyId, clientId, projectId, entryIds)).resolves.toEqual({
      error: "One or more entries have already been invoiced",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-API error", async () => {
    mockedCreateInvoiceFromTimeEntries.mockRejectedValueOnce(new Error("boom"));

    await expect(createInvoiceFromTimeEntriesAction(agencyId, clientId, projectId, entryIds)).resolves.toEqual({
      error: "Unable to create an invoice from these time entries",
    });
  });
});
