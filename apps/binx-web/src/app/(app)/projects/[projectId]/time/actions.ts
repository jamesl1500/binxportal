/**
 * actions.ts - Project Time Tracking
 *
 * Server actions for a single project's Time tab: starting/stopping the
 * caller's timer, logging/editing/deleting manual entries, and generating an
 * invoice from a set of uninvoiced entries. Plain authenticated mutations —
 * no session cookies change — calling binx-api directly via
 * `lib/time-tracking.ts`, same pattern as the other project actions in
 * `../actions.ts`. Every action returns `{ error? }` and revalidates this
 * project's Time subpage so a `router.refresh()` in the client picks up the
 * change.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/time/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import type { InvoiceDetail } from "@/lib/invoicing";
import {
  createInvoiceFromTimeEntries,
  deleteTimeEntry,
  logManualEntry,
  startTimer,
  stopTimer,
  updateTimeEntry,
  type ManualEntryInput,
  type StartTimerInput,
  type TimeEntry,
  type TimeEntryUpdateInput,
} from "@/lib/time-tracking";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

function revalidateTimeTab(projectId: string): void {
  revalidatePath(`/projects/${projectId}/time`);
}

export interface TimeEntryActionResult {
  error?: string;
  entry?: TimeEntry;
}

export async function startTimerAction(
  agencyId: string,
  projectId: string,
  input: StartTimerInput,
): Promise<TimeEntryActionResult> {
  try {
    const entry = await startTimer(agencyId, input);
    revalidateTimeTab(projectId);
    return { entry };
  } catch (error) {
    return errorResult(error, "Unable to start the timer");
  }
}

export async function stopTimerAction(
  agencyId: string,
  projectId: string,
  entryId: string,
): Promise<TimeEntryActionResult> {
  try {
    const entry = await stopTimer(agencyId, entryId);
    revalidateTimeTab(projectId);
    return { entry };
  } catch (error) {
    return errorResult(error, "Unable to stop the timer");
  }
}

export async function logManualEntryAction(
  agencyId: string,
  projectId: string,
  input: ManualEntryInput,
): Promise<TimeEntryActionResult> {
  try {
    const entry = await logManualEntry(agencyId, input);
    revalidateTimeTab(projectId);
    return { entry };
  } catch (error) {
    return errorResult(error, "Unable to log time entry");
  }
}

export async function updateTimeEntryAction(
  agencyId: string,
  projectId: string,
  entryId: string,
  input: TimeEntryUpdateInput,
): Promise<TimeEntryActionResult> {
  try {
    const entry = await updateTimeEntry(agencyId, entryId, input);
    revalidateTimeTab(projectId);
    return { entry };
  } catch (error) {
    return errorResult(error, "Unable to update time entry");
  }
}

export interface DeleteTimeEntryActionResult {
  error?: string;
}

export async function deleteTimeEntryAction(
  agencyId: string,
  projectId: string,
  entryId: string,
): Promise<DeleteTimeEntryActionResult> {
  try {
    await deleteTimeEntry(agencyId, entryId);
    revalidateTimeTab(projectId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete time entry");
  }
}

export interface CreateInvoiceFromTimeEntriesActionResult {
  error?: string;
  invoice?: InvoiceDetail;
}

/**
 * createInvoiceFromTimeEntriesAction
 *
 * Bills the selected uninvoiced entries onto a new draft invoice, then
 * redirects to that invoice's detail page. Only returns (with `{ error }`)
 * when creation fails — on success it redirects and never resolves normally,
 * same pattern as `deleteInvoiceAction` / `deleteClientAction`.
 */
export async function createInvoiceFromTimeEntriesAction(
  agencyId: string,
  clientId: string,
  projectId: string,
  entryIds: string[],
): Promise<CreateInvoiceFromTimeEntriesActionResult> {
  let invoice: InvoiceDetail;
  try {
    invoice = await createInvoiceFromTimeEntries(agencyId, clientId, projectId, entryIds);
  } catch (error) {
    return errorResult(error, "Unable to create an invoice from these time entries");
  }
  revalidateTimeTab(projectId);
  redirect(`/invoices/${invoice.id}`);
}
