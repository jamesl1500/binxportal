/**
 * actions.ts - Public Proposal
 *
 * Server actions for the unauthenticated, token-scoped proposal share page —
 * thin wraps around `lib/proposals.ts`'s public functions. No session, no
 * agency context; the token alone scopes every call.
 *
 * @module apps/binx-web/src/app/proposals/public/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { declinePublicProposal, type ProposalPublic, signPublicProposal } from "@/lib/proposals";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface PublicProposalActionResult {
  error?: string;
  proposal?: ProposalPublic;
}

export async function signPublicProposalAction(
  token: string,
  signerName: string,
  signerEmail: string,
): Promise<PublicProposalActionResult> {
  try {
    return { proposal: await signPublicProposal(token, signerName, signerEmail) };
  } catch (error) {
    return errorResult(error, "Unable to sign this proposal");
  }
}

export async function declinePublicProposalAction(
  token: string,
  reason: string | null,
): Promise<PublicProposalActionResult> {
  try {
    return { proposal: await declinePublicProposal(token, reason) };
  } catch (error) {
    return errorResult(error, "Unable to decline this proposal");
  }
}
