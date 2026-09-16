/**
 * actions.ts - Onboarding Step Two
 *
 * Server action for creating the user's first agency, step two of three in
 * onboarding — plan selection follows. A plain authenticated mutation — no
 * session cookies change — so it calls binx-api directly via
 * `lib/agencies.ts` rather than going through an internal `/api/*` proxy
 * route.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/two/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { createAgency } from "@/lib/agencies";

export interface CreateAgencyActionResult {
  error?: string;
}

export async function createAgencyAction(name: string): Promise<CreateAgencyActionResult> {
  try {
    await createAgency(name);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create your agency" };
  }

  redirect("/onboarding/three");
}
