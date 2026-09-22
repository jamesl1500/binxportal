/**
 * recurring-invoices.ts
 *
 * Server-only helpers for binx-api's
 * `/agencies/{agencyId}/recurring-invoices/*` endpoints (retainer
 * schedules that generate draft, or auto-issued, invoices on a cadence).
 * Money is integer cents; percentages/quantities are decimal strings, same
 * convention as `lib/invoicing.ts`.
 *
 * @module apps/binx-web/src/lib/recurring-invoices.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Invoice } from "@/lib/invoicing";
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

export type RecurringSchedule = Schemas["RecurringScheduleRead"];
export type RecurringLineItem = Schemas["RecurringLineItemRead"];

export const RECURRING_INTERVALS = ["weekly", "monthly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export interface RecurringLineItemInput {
  description: string;
  quantity: string;
  unitPriceCents: number;
}

export interface RecurringScheduleInput {
  clientId: string;
  projectId: string | null;
  title: string;
  interval: RecurringInterval;
  intervalCount: number;
  dayOfMonth: number | null;
  weekday: number | null;
  dueDays: number;
  taxRatePercent: string;
  notes: string | null;
  paymentInstructions: string | null;
  autoIssue: boolean;
  startDate: string | null;
  lineItems: RecurringLineItemInput[];
}

function toPayload(input: RecurringScheduleInput) {
  return {
    client_id: input.clientId,
    project_id: input.projectId,
    title: input.title,
    interval: input.interval,
    interval_count: input.intervalCount,
    day_of_month: input.dayOfMonth,
    weekday: input.weekday,
    due_days: input.dueDays,
    tax_rate_percent: input.taxRatePercent,
    notes: input.notes,
    payment_instructions: input.paymentInstructions,
    auto_issue: input.autoIssue,
    start_date: input.startDate,
    line_items: input.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
    })),
  };
}

/**
 * getRecurringSchedules
 *
 * Lists an agency's recurring-invoice schedules via
 * `GET /agencies/{agencyId}/recurring-invoices`. binx-api catches up any
 * schedules that are due before returning the list (no cron in this
 * deployment — see the module docstring on `recurring_service` in binx-api).
 *
 * @function getRecurringSchedules
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getRecurringSchedules(agencyId: string, clientId?: string): Promise<RecurringSchedule[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<RecurringSchedule[]>(`/agencies/${agencyId}/recurring-invoices`, {
      headers,
      params: clientId ? { client_id: clientId } : undefined,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load recurring invoices");
  }
}

/**
 * createRecurringSchedule
 *
 * Creates a schedule via `POST /agencies/{agencyId}/recurring-invoices`.
 * Its first `next_run_date` is anchored from `startDate` (or today).
 *
 * @function createRecurringSchedule
 * @throws {AuthApiError} - Thrown if not authenticated, or the client isn't in this agency.
 */
export async function createRecurringSchedule(
  agencyId: string,
  input: RecurringScheduleInput,
): Promise<RecurringSchedule> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<RecurringSchedule>(
      `/agencies/${agencyId}/recurring-invoices`,
      toPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create recurring invoice schedule");
  }
}

/**
 * updateRecurringSchedule
 *
 * Replaces a schedule's terms via
 * `PATCH /agencies/{agencyId}/recurring-invoices/{scheduleId}`. Owner/admin
 * only. `next_run_date` is left alone unless `startDate` is given.
 *
 * @function updateRecurringSchedule
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function updateRecurringSchedule(
  agencyId: string,
  scheduleId: string,
  input: RecurringScheduleInput,
): Promise<RecurringSchedule> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<RecurringSchedule>(
      `/agencies/${agencyId}/recurring-invoices/${scheduleId}`,
      toPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update recurring invoice schedule");
  }
}

/**
 * pauseRecurringSchedule
 *
 * Pauses a schedule via `POST /agencies/{agencyId}/recurring-invoices/{scheduleId}/pause`
 * — it stops generating invoices until resumed. Owner/admin only.
 *
 * @function pauseRecurringSchedule
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function pauseRecurringSchedule(agencyId: string, scheduleId: string): Promise<RecurringSchedule> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<RecurringSchedule>(
      `/agencies/${agencyId}/recurring-invoices/${scheduleId}/pause`,
      null,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to pause recurring invoice schedule");
  }
}

/**
 * resumeRecurringSchedule
 *
 * Resumes a paused schedule via
 * `POST /agencies/{agencyId}/recurring-invoices/{scheduleId}/resume`. Owner/admin only.
 *
 * @function resumeRecurringSchedule
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function resumeRecurringSchedule(agencyId: string, scheduleId: string): Promise<RecurringSchedule> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<RecurringSchedule>(
      `/agencies/${agencyId}/recurring-invoices/${scheduleId}/resume`,
      null,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to resume recurring invoice schedule");
  }
}

/**
 * deleteRecurringSchedule
 *
 * Permanently deletes a schedule via
 * `DELETE /agencies/{agencyId}/recurring-invoices/{scheduleId}`. Owner/admin
 * only. Invoices it already generated are untouched.
 *
 * @function deleteRecurringSchedule
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function deleteRecurringSchedule(agencyId: string, scheduleId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/recurring-invoices/${scheduleId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete recurring invoice schedule");
  }
}

/**
 * runRecurringScheduleNow
 *
 * Generates an invoice immediately via
 * `POST /agencies/{agencyId}/recurring-invoices/{scheduleId}/run-now`,
 * ignoring `next_run_date`, and still advances the schedule. Owner/admin only.
 *
 * @function runRecurringScheduleNow
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission.
 */
export async function runRecurringScheduleNow(agencyId: string, scheduleId: string): Promise<Invoice> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Invoice>(
      `/agencies/${agencyId}/recurring-invoices/${scheduleId}/run-now`,
      null,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to generate invoice now");
  }
}

// ---- Display helpers ----

export const RECURRING_INTERVAL_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};

export function recurringIntervalLabel(interval: string): string {
  return RECURRING_INTERVAL_LABELS[interval] ?? interval;
}

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}
