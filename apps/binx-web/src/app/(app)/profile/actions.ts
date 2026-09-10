/**
 * actions.ts - Profile
 *
 * Server action for saving edits made on the profile page. A plain
 * authenticated mutation — no session cookies change — so it calls
 * binx-api directly via `lib/users.ts` rather than going through an
 * internal `/api/*` proxy route.
 *
 * @module apps/binx-web/src/app/(app)/profile/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { updateCurrentUserProfile } from "@/lib/users";

export interface UpdateProfileActionInput {
  fullName: string;
  jobTitle: string | null;
  phoneNumber: string | null;
  summary: string | null;
}

export interface UpdateProfileActionResult {
  error?: string;
}

export async function updateProfileAction(input: UpdateProfileActionInput): Promise<UpdateProfileActionResult> {
  try {
    await updateCurrentUserProfile({
      fullName: input.fullName,
      jobTitle: input.jobTitle,
      phoneNumber: input.phoneNumber,
      summary: input.summary,
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save your profile" };
  }

  return {};
}
