/**
 * actions.ts - Portal Proposals
 *
 * Server actions for a signed-in client contact's own proposal decisions —
 * thin wraps around `lib/portal.ts`'s authenticated sign/decline calls.
 * Unlike the public share-token flow, no name/email is collected: the portal
 * session already identifies the signer.
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  declinePortalProposal,
  type PortalProposalDetail,
  signPortalProposal,
} from "@/lib/portal";

export interface PortalProposalActionResult {
  error?: string;
  proposal?: PortalProposalDetail;
}

export async function signPortalProposalAction(
  proposalId: string,
): Promise<PortalProposalActionResult> {
  try {
    const proposal = await signPortalProposal(proposalId);
    refresh();
    return { proposal };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to sign this proposal" };
  }
}

export async function declinePortalProposalAction(
  proposalId: string,
  reason: string | null,
): Promise<PortalProposalActionResult> {
  try {
    const proposal = await declinePortalProposal(proposalId, reason);
    refresh();
    return { proposal };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to decline this proposal" };
  }
}
