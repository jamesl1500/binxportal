/**
 * actions.ts - Portal Accept Invite
 *
 * Server action for accepting a client-portal invitation from the emailed
 * link. On success the caller becomes a ClientContact; redirect them into
 * the portal.
 *
 * @module apps/binx-web/src/app/(portal-auth)/auth/portal-invite/actions.ts
 * @author Binx Portal
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError, logout } from "@/lib/auth";
import { acceptPortalInvitation } from "@/lib/portal";

export interface AcceptPortalInviteResult {
  error?: string;
}

export async function acceptPortalInviteAction(
  token: string,
): Promise<AcceptPortalInviteResult> {
  try {
    await acceptPortalInvitation(token);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to accept this invitation" };
  }

  redirect("/portal");
}

/**
 * Signed in as a different account than the invitation is for (e.g. the
 * agency owner opening a client's invite in the same browser): sign out and
 * come back to this invitation, which then offers signup / sign-in for the
 * invited address. Without this the user is stuck — /portal/login bounces a
 * signed-in user straight back here.
 */
export async function signOutForPortalInviteAction(token: string): Promise<void> {
  await logout();
  redirect(`/auth/portal-invite?token=${encodeURIComponent(token)}`);
}
