/**
 * actions.ts - Public Proposal
 *
 * Server actions for the unauthenticated, token-scoped proposal share page —
 * thin wraps around `lib/proposals.ts`'s public functions. No session, no
 * agency context; the token alone scopes every call.
 *
 * @module apps/binx-web/src/app/proposals/public/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { rememberProposalAccess } from "@/lib/proposal-access";
import {
  choosePublicProposalOptions,
  confirmPublicDeposit,
  declinePublicProposal,
  type ProposalPublic,
  requestPublicProposalCode,
  signPublicProposal,
  startPublicDepositCheckout,
  verifyPublicProposalCode,
} from "@/lib/proposals";

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
  consent: boolean,
  documentHash: string | null,
): Promise<PublicProposalActionResult> {
  try {
    const proposal = await signPublicProposal(
      token,
      signerName,
      signerEmail,
      consent,
      documentHash,
    );
    refresh();
    return { proposal };
  } catch (error) {
    return errorResult(error, "Unable to sign this proposal");
  }
}

export async function choosePublicProposalOptionsAction(
  token: string,
  packageId: string | null,
  addOnIds: string[],
): Promise<PublicProposalActionResult> {
  try {
    const proposal = await choosePublicProposalOptions(
      token,
      packageId,
      addOnIds,
    );
    refresh();
    return { proposal };
  } catch (error) {
    return errorResult(error, "Unable to save your choice");
  }
}

export async function declinePublicProposalAction(
  token: string,
  reason: string | null,
): Promise<PublicProposalActionResult> {
  try {
    const proposal = await declinePublicProposal(token, reason);
    refresh();
    return { proposal };
  } catch (error) {
    return errorResult(error, "Unable to decline this proposal");
  }
}

/** Emails the proposal's recipient a code that opens it. */
export async function requestProposalCodeAction(
  token: string,
): Promise<{ error?: string; emailHint?: string }> {
  try {
    const { email_hint } = await requestPublicProposalCode(token);
    return { emailHint: email_hint };
  } catch (error) {
    return errorResult(error, "Unable to send a code");
  }
}

/** Checks the code; on success keeps the access and reloads the page open. */
export async function verifyProposalCodeAction(
  token: string,
  code: string,
): Promise<{ error?: string }> {
  try {
    const access = await verifyPublicProposalCode(token, code);
    await rememberProposalAccess(
      token,
      access.access_token,
      access.expires_in_seconds,
    );
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to check that code");
  }
}

/** Starts paying the deposit; the caller sends the browser to the URL. */
export async function startDepositCheckoutAction(
  token: string,
): Promise<{ error?: string; checkoutUrl?: string }> {
  try {
    const { checkout_url } = await startPublicDepositCheckout(token);
    return { checkoutUrl: checkout_url };
  } catch (error) {
    return errorResult(error, "Unable to start the payment");
  }
}

/** Back from Stripe: checks the payment, then reloads the page's data. */
export async function confirmDepositAction(
  token: string,
  sessionId: string,
): Promise<{ error?: string; outcome?: string }> {
  try {
    const { outcome } = await confirmPublicDeposit(token, sessionId);
    refresh();
    return { outcome };
  } catch (error) {
    return errorResult(error, "Unable to check the payment");
  }
}
