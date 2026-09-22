/**
 * actions.ts - Proposals
 *
 * Server actions for the proposals pages — plain authenticated mutations (no
 * session cookies change), calling binx-api directly via `lib/proposals.ts`.
 * Every action returns `{ error?, ... }`, the same shape the invoicing
 * actions use.
 *
 * @module apps/binx-web/src/app/(app)/proposals/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import {
  createProposal,
  deleteProposal,
  type ProposalDetail,
  type ProposalInput,
  sendProposal,
  updateProposal,
} from "@/lib/proposals";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface ProposalActionResult {
  error?: string;
  proposal?: ProposalDetail;
}

export async function createProposalAction(agencyId: string, input: ProposalInput): Promise<ProposalActionResult> {
  try {
    return { proposal: await createProposal(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to create proposal");
  }
}

export async function updateProposalAction(
  agencyId: string,
  proposalId: string,
  input: ProposalInput,
): Promise<ProposalActionResult> {
  try {
    return { proposal: await updateProposal(agencyId, proposalId, input) };
  } catch (error) {
    return errorResult(error, "Unable to update proposal");
  }
}

export async function deleteProposalAction(agencyId: string, proposalId: string): Promise<{ error?: string }> {
  try {
    await deleteProposal(agencyId, proposalId);
  } catch (error) {
    return errorResult(error, "Unable to delete proposal");
  }
  redirect("/proposals");
}

export async function sendProposalAction(
  agencyId: string,
  proposalId: string,
  recipientEmail: string | null,
): Promise<ProposalActionResult> {
  try {
    return { proposal: await sendProposal(agencyId, proposalId, recipientEmail) };
  } catch (error) {
    return errorResult(error, "Unable to send proposal");
  }
}
