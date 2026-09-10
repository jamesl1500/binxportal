/**
 * actions.ts - Portal Accept Invite
 *
 * Server action for accepting a client-portal invitation from the emailed
 * link. On success the caller becomes a ClientContact; redirect them into
 * the portal.
 *
 * @module apps/binx-web/src/app/(auth)/auth/portal-invite/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { acceptPortalInvitation } from "@/lib/portal";

export interface AcceptPortalInviteResult {
  error?: string;
}

export async function acceptPortalInviteAction(token: string): Promise<AcceptPortalInviteResult> {
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
