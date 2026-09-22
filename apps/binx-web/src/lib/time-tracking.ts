/**
 * time-tracking.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/time-entries/*`
 * endpoints, plus `createInvoiceFromTimeEntries` which posts to
 * `/agencies/{agencyId}/invoices/from-time-entries` (see `lib/invoicing.ts`
 * for the resulting `InvoiceDetail` shape). Money is integer cents, same
 * convention as `lib/invoicing.ts`.
 *
 * @module apps/binx-web/src/lib/time-tracking.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/invoicing";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

// ---- Types ----

export type TimeEntry = Schemas["TimeEntryRead"];
export type UninvoicedSummary = Schemas["UninvoicedSummaryRead"];

export interface StartTimerInput {
  projectId: string;
  taskId: string | null;
  description: string | null;
  isBillable: boolean;
}

export interface ManualEntryInput {
  projectId: string;
  taskId: string | null;
  description: string | null;
  startedAt: string;
  endedAt: string;
  isBillable: boolean;
  hourlyRateCents: number | null;
}

export interface TimeEntryUpdateInput {
  description: string | null;
  taskId: string | null;
  isBillable: boolean;
  hourlyRateCents: number | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface TimeEntryFilter {
  projectId?: string;
  taskId?: string;
  userId?: string;
  billable?: boolean;
  uninvoiced?: boolean;
}

// ---- Timer ----

/**
 * getRunningTimer
 *
 * The caller's currently running timer in this agency, if any, via
 * `GET /agencies/{agencyId}/time-entries/running`. binx-api allows at most
 * one running entry per user per agency.
 *
 * @function getRunningTimer
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getRunningTimer(agencyId: string): Promise<TimeEntry | null> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<TimeEntry | null>(`/agencies/${agencyId}/time-entries/running`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the running timer");
  }
}

/**
 * startTimer
 *
 * Starts a new running timer via `POST /agencies/{agencyId}/time-entries/start`.
 * binx-api returns 409 if the caller already has one running in this agency.
 *
 * @function startTimer
 * @throws {AuthApiError} - Thrown if not authenticated, or a timer is already running.
 */
export async function startTimer(agencyId: string, input: StartTimerInput): Promise<TimeEntry> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<TimeEntry>(
      `/agencies/${agencyId}/time-entries/start`,
      {
        project_id: input.projectId,
        task_id: input.taskId,
        description: input.description,
        is_billable: input.isBillable,
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to start the timer");
  }
}

/**
 * stopTimer
 *
 * Stops a running entry via `POST /agencies/{agencyId}/time-entries/{entryId}/stop`,
 * snapshotting its hourly rate from the project's default at that moment.
 *
 * @function stopTimer
 * @throws {AuthApiError} - Thrown if not authenticated, or the entry isn't running.
 */
export async function stopTimer(agencyId: string, entryId: string): Promise<TimeEntry> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<TimeEntry>(`/agencies/${agencyId}/time-entries/${entryId}/stop`, null, {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to stop the timer");
  }
}

// ---- Manual entries ----

/**
 * logManualEntry
 *
 * Logs a completed time entry directly (no timer) via
 * `POST /agencies/{agencyId}/time-entries`.
 *
 * @function logManualEntry
 * @throws {AuthApiError} - Thrown if not authenticated, or `endedAt` isn't after `startedAt`.
 */
export async function logManualEntry(agencyId: string, input: ManualEntryInput): Promise<TimeEntry> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<TimeEntry>(
      `/agencies/${agencyId}/time-entries`,
      {
        project_id: input.projectId,
        task_id: input.taskId,
        description: input.description,
        started_at: input.startedAt,
        ended_at: input.endedAt,
        is_billable: input.isBillable,
        hourly_rate_cents: input.hourlyRateCents,
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to log time entry");
  }
}

/**
 * updateTimeEntry
 *
 * Edits an entry via `PATCH /agencies/{agencyId}/time-entries/{entryId}`.
 * binx-api rejects this once the entry has been invoiced.
 *
 * @function updateTimeEntry
 * @throws {AuthApiError} - Thrown if not authenticated, or the entry is already invoiced.
 */
export async function updateTimeEntry(
  agencyId: string,
  entryId: string,
  input: TimeEntryUpdateInput,
): Promise<TimeEntry> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<TimeEntry>(
      `/agencies/${agencyId}/time-entries/${entryId}`,
      {
        description: input.description,
        task_id: input.taskId,
        is_billable: input.isBillable,
        hourly_rate_cents: input.hourlyRateCents,
        started_at: input.startedAt,
        ended_at: input.endedAt,
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update time entry");
  }
}

/**
 * deleteTimeEntry
 *
 * Removes an entry via `DELETE /agencies/{agencyId}/time-entries/{entryId}`.
 * binx-api rejects this once the entry has been invoiced.
 *
 * @function deleteTimeEntry
 * @throws {AuthApiError} - Thrown if not authenticated, or the entry is already invoiced.
 */
export async function deleteTimeEntry(agencyId: string, entryId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/time-entries/${entryId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete time entry");
  }
}

/**
 * getTimeEntries
 *
 * Lists time entries via `GET /agencies/{agencyId}/time-entries`, optionally
 * filtered by project, task, user, billable-only, or uninvoiced-only.
 *
 * @function getTimeEntries
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getTimeEntries(agencyId: string, filter: TimeEntryFilter = {}): Promise<TimeEntry[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<TimeEntry[]>(`/agencies/${agencyId}/time-entries`, {
      headers,
      params: {
        project_id: filter.projectId,
        task_id: filter.taskId,
        user_id: filter.userId,
        billable: filter.billable,
        uninvoiced: filter.uninvoiced,
      },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load time entries");
  }
}

/**
 * getUninvoicedSummary
 *
 * Rolled-up uninvoiced-time figures for a project via
 * `GET /agencies/{agencyId}/time-entries/uninvoiced-summary`.
 *
 * @function getUninvoicedSummary
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getUninvoicedSummary(agencyId: string, projectId: string): Promise<UninvoicedSummary> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<UninvoicedSummary>(`/agencies/${agencyId}/time-entries/uninvoiced-summary`, {
      headers,
      params: { project_id: projectId },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the uninvoiced summary");
  }
}

/**
 * createInvoiceFromTimeEntries
 *
 * Bills a set of uninvoiced entries onto a new draft invoice via
 * `POST /agencies/{agencyId}/invoices/from-time-entries`. All entries must
 * belong to the same project and not already be invoiced or running.
 *
 * @function createInvoiceFromTimeEntries
 * @throws {AuthApiError} - Thrown if not authenticated, or any entry fails validation (already invoiced, running, or missing a rate).
 */
export async function createInvoiceFromTimeEntries(
  agencyId: string,
  clientId: string,
  projectId: string,
  entryIds: string[],
): Promise<InvoiceDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<InvoiceDetail>(
      `/agencies/${agencyId}/invoices/from-time-entries`,
      { client_id: clientId, project_id: projectId, entry_ids: entryIds },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create an invoice from these time entries");
  }
}
