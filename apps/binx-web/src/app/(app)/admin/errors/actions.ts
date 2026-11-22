/**
 * actions.ts - Admin error dashboard
 *
 * Triage for an error issue: resolve it, ignore it, or reopen it. Calls
 * `refresh()` so the issue page and the sidebar badge re-render at once.
 * binx-api enforces platform-admin access.
 *
 * @module apps/binx-web/src/app/(app)/admin/errors/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { setErrorIssueStatus } from "@/lib/admin-errors";
import { isStatus, STATUS_LABELS } from "@/lib/admin-errors-client";
import { AuthApiError } from "@/lib/auth";

export interface ErrorStatusState {
  message?: string;
  error?: string;
}

export async function setIssueStatusAction(
  issueId: string,
  status: string,
): Promise<ErrorStatusState> {
  if (!isStatus(status)) return { error: "Unknown status" };
  try {
    const updated = await setErrorIssueStatus(issueId, status);
    refresh();
    return {
      message: `Marked ${STATUS_LABELS[updated.status].toLowerCase()}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof AuthApiError
          ? error.message
          : "Unable to update the issue",
    };
  }
}
