/**
 * actions.ts - Recurring invoices
 *
 * Server actions for the recurring-invoices (retainer) pages — plain
 * authenticated mutations calling binx-api directly via
 * `lib/recurring-invoices.ts`. Every action returns `{ error? }`, the same
 * shape the invoicing actions use. `runNowAction` also revalidates `/invoices`
 * since it creates a new invoice there.
 *
 * @module apps/binx-web/src/app/(app)/invoices/recurring/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import type { Invoice } from "@/lib/invoicing";
import {
  createRecurringSchedule,
  deleteRecurringSchedule,
  pauseRecurringSchedule,
  type RecurringSchedule,
  type RecurringScheduleInput,
  resumeRecurringSchedule,
  runRecurringScheduleNow,
} from "@/lib/recurring-invoices";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface RecurringScheduleActionResult {
  error?: string;
  schedule?: RecurringSchedule;
}

export async function createRecurringScheduleAction(
  agencyId: string,
  input: RecurringScheduleInput,
): Promise<RecurringScheduleActionResult> {
  try {
    const schedule = await createRecurringSchedule(agencyId, input);
    revalidatePath("/invoices/recurring");
    return { schedule };
  } catch (error) {
    return errorResult(error, "Unable to create recurring invoice schedule");
  }
}

export async function pauseRecurringScheduleAction(
  agencyId: string,
  scheduleId: string,
): Promise<RecurringScheduleActionResult> {
  try {
    const schedule = await pauseRecurringSchedule(agencyId, scheduleId);
    revalidatePath("/invoices/recurring");
    return { schedule };
  } catch (error) {
    return errorResult(error, "Unable to pause recurring invoice schedule");
  }
}

export async function resumeRecurringScheduleAction(
  agencyId: string,
  scheduleId: string,
): Promise<RecurringScheduleActionResult> {
  try {
    const schedule = await resumeRecurringSchedule(agencyId, scheduleId);
    revalidatePath("/invoices/recurring");
    return { schedule };
  } catch (error) {
    return errorResult(error, "Unable to resume recurring invoice schedule");
  }
}

export async function deleteRecurringScheduleAction(
  agencyId: string,
  scheduleId: string,
): Promise<{ error?: string }> {
  try {
    await deleteRecurringSchedule(agencyId, scheduleId);
    revalidatePath("/invoices/recurring");
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete recurring invoice schedule");
  }
}

export interface RunRecurringScheduleActionResult {
  error?: string;
  invoice?: Invoice;
}

export async function runRecurringScheduleNowAction(
  agencyId: string,
  scheduleId: string,
): Promise<RunRecurringScheduleActionResult> {
  try {
    const invoice = await runRecurringScheduleNow(agencyId, scheduleId);
    revalidatePath("/invoices/recurring");
    revalidatePath("/invoices");
    return { invoice };
  } catch (error) {
    return errorResult(error, "Unable to generate invoice now");
  }
}
