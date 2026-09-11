/**
 * actions.ts - Dashboard
 *
 * Server action behind the dashboard's AI briefing card. Kept separate from
 * settings/actions.ts because it's a plain, no-cookie-changing read through
 * `lib/ai.ts` scoped to this page, not a settings mutation.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/actions.ts
 * @author Binx.io
 */
"use server";

import { getAiBriefing } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";

export interface AiBriefingActionResult {
  error?: string;
  notConfigured?: boolean;
  briefing?: string;
}

export async function getAiBriefingAction(agencyId: string, force = false): Promise<AiBriefingActionResult> {
  try {
    return { briefing: await getAiBriefing(agencyId, force) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message, notConfigured: error.status === 503 };
    }
    return { error: "Unable to generate a briefing" };
  }
}
