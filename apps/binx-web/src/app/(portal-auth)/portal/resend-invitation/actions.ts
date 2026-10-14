/**
 * actions.ts - Client Portal Resend Invitation
 *
 * Server actions for the resend-invitation form. The visitor has no account
 * yet, so both call unauthenticated binx-api endpoints:
 * `searchPortalAgenciesAction` backs the agency-name suggestions, and
 * `resendPortalInvitationAction` asks for the invitation email again.
 *
 * @module apps/binx-web/src/app/(portal-auth)/portal/resend-invitation/actions.ts
 * @author Binx Portal
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  type PortalAgencyMatch,
  type PortalInvitationResendInput,
  resendPortalInvitation,
  searchPortalAgencies,
} from "@/lib/portal";

/**
 * searchPortalAgenciesAction
 *
 * Agencies whose name matches what's been typed so far. Suggestions are a
 * convenience, so any failure (rate limit, API down) just means none — the
 * field still works as a plain text input.
 */
export async function searchPortalAgenciesAction(
  query: string,
): Promise<PortalAgencyMatch[]> {
  try {
    return await searchPortalAgencies(query);
  } catch {
    return [];
  }
}

export interface ResendPortalInvitationActionResult {
  error?: string;
  message?: string;
}

/**
 * resendPortalInvitationAction
 *
 * Re-sends the client-portal invitation that the named agency has open for
 * this email, if there is one. binx-api answers with the same message whether
 * or not anything matched (so the form can't be used to find out who's been
 * invited where) — `error` is only for a request that couldn't be made at all.
 */
export async function resendPortalInvitationAction(
  input: PortalInvitationResendInput,
): Promise<ResendPortalInvitationActionResult> {
  try {
    return { message: await resendPortalInvitation(input) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return {
        error:
          error.status === 429
            ? "Too many requests right now — please try again in a little while."
            : error.message,
      };
    }
    return { error: "Unable to resend your invitation" };
  }
}
