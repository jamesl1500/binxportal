/**
 * actions.ts - Activity
 *
 * Server actions behind the /activity page's filter + "load more" (the agency
 * feed) and the account page's security-history list. Read-only pass-throughs
 * to `lib/activity.ts`.
 *
 * @module apps/binx-web/src/app/(app)/activity/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { type ActivityPage, type ActivityQuery, getAgencyActivity, getMyActivity } from "@/lib/activity";

export interface ActivityPageActionResult {
  error?: string;
  page?: ActivityPage;
}

export async function getAgencyActivityAction(
  agencyId: string,
  query: ActivityQuery = {},
): Promise<ActivityPageActionResult> {
  try {
    return { page: await getAgencyActivity(agencyId, query) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to load activity" };
  }
}

export async function getMyActivityAction(
  query: { limit?: number; offset?: number } = {},
): Promise<ActivityPageActionResult> {
  try {
    return { page: await getMyActivity(query) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to load your security activity" };
  }
}
