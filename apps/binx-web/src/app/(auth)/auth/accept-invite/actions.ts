/**
 * Accept Invite Actions
 *
 * Server action for accepting an agency invitation from the emailed link.
 * On success, sets the newly joined agency as "current" (so the app opens
 * into it, not whatever agency happened to be current before) and redirects
 * to the dashboard — mirroring deleteAgencyAction's shape in app/(app)/settings/actions.ts.
 *
 * @module apps/binx-web/src/app/(auth)/auth/accept-invite/actions.ts
 * @author Binx Portal
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError, logout } from "@/lib/auth";
import { acceptAgencyInvitation, setCurrentAgencyId } from "@/lib/agencies";

export interface AcceptInviteActionResult {
  error?: string;
}

export async function acceptInviteAction(
  token: string,
): Promise<AcceptInviteActionResult> {
  let agencyId: string;

  try {
    const agency = await acceptAgencyInvitation(token);
    agencyId = agency.id;
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to accept invitation" };
  }

  await setCurrentAgencyId(agencyId);
  redirect("/dashboard");
}

/**
 * Signed in as a different account than the invitation is for: sign out and
 * come back to this invitation, which then offers log-in / sign-up for the
 * invited address instead of an Accept button that can only fail.
 */
export async function signOutForInviteAction(token: string): Promise<void> {
  await logout();
  redirect(`/auth/accept-invite?token=${encodeURIComponent(token)}`);
}
