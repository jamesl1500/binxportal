/**
 * actions.ts - Onboarding Step One
 *
 * Server action for saving the profile details collected in onboarding step
 * one. This is a plain authenticated mutation — no session cookies change —
 * so it calls binx-api directly via `lib/users.ts` rather than going through
 * an internal `/api/*` proxy route.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/one/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { updateCurrentUserProfile } from "@/lib/users";

export interface UpdateProfileActionResult {
  error?: string;
}

export async function updateProfileAction(
  phoneNumber: string | null,
  jobTitle: string | null,
): Promise<UpdateProfileActionResult> {
  try {
    await updateCurrentUserProfile({ phoneNumber, jobTitle });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save your details" };
  }

  redirect("/onboarding/two");
}
