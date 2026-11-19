/**
 * actions.ts - Binx team console
 *
 * Server actions behind the admin console's support tools: trial changes,
 * account actions (reset, verify, sign out, deactivate, admin role) and
 * private support notes. Each returns a sentence to show inline and calls
 * `refresh()` so the detail page — and its audit trail — re-render at once.
 * binx-api enforces platform-admin access on every one of these.
 *
 * @module apps/binx-web/src/app/(app)/admin/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import {
  type UserAction,
  addAdminNote,
  endTrial,
  grantTrial,
  runUserAction,
} from "@/lib/admin";
import { AuthApiError } from "@/lib/auth";

export interface AdminActionState {
  message?: string;
  error?: string;
}

function fail(error: unknown, fallback: string): AdminActionState {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function grantTrialAction(
  agencyId: string,
  input: { plan: string; days: number; reason?: string },
): Promise<AdminActionState> {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 90) {
    return { error: "Pick between 1 and 90 days" };
  }
  try {
    const { message } = await grantTrial(agencyId, input);
    refresh();
    return { message };
  } catch (error) {
    return fail(error, "Unable to update the trial");
  }
}

export async function endTrialAction(
  agencyId: string,
): Promise<AdminActionState> {
  try {
    const { message } = await endTrial(agencyId);
    refresh();
    return { message };
  } catch (error) {
    return fail(error, "Unable to end the trial");
  }
}

export async function userAction(
  userId: string,
  action: UserAction,
  reason?: string,
): Promise<AdminActionState> {
  try {
    const { message } = await runUserAction(userId, action, reason);
    refresh();
    return { message };
  } catch (error) {
    return fail(error, "That didn't work. Please try again.");
  }
}

export async function addNoteAction(
  target: "user" | "agency",
  targetId: string,
  body: string,
): Promise<AdminActionState> {
  if (!body.trim()) {
    return { error: "Write something first" };
  }
  try {
    await addAdminNote(target, targetId, body.trim());
    refresh();
    return { message: "Note saved" };
  } catch (error) {
    return fail(error, "Unable to save the note");
  }
}
