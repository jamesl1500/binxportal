/**
 * proposal-access.ts
 *
 * Server-only: the access token that opens a proposal protected by an email
 * code (binx-api proposals/access.py). Once the recipient enters the code,
 * the token is kept in an httpOnly cookie named after a hash of the share
 * token (so one browser can hold several), and every share-link request to
 * binx-api carries it in the `X-Proposal-Access` header.
 *
 * @module apps/binx-web/src/lib/proposal-access.ts
 * @author Binx Portal
 */
import { createHash } from "node:crypto";

import axios from "axios";
import { cookies } from "next/headers";

export const PROPOSAL_ACCESS_HEADER = "X-Proposal-Access";

export function proposalAccessCookieName(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `binx_pa_${digest.slice(0, 16)}`;
}

/** The header to send for this share link, if the visitor has verified. */
export async function proposalAccessHeaders(
  token: string,
): Promise<Record<string, string>> {
  const value = (await cookies()).get(proposalAccessCookieName(token))?.value;
  return value ? { [PROPOSAL_ACCESS_HEADER]: value } : {};
}

/** Keeps the access token (call from a Server Action or route handler). */
export async function rememberProposalAccess(
  token: string,
  accessToken: string,
  maxAgeSeconds: number,
): Promise<void> {
  (await cookies()).set(proposalAccessCookieName(token), accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/**
 * The proposal asks for the code emailed to its recipient before it opens.
 * Carries what the code page shows: never the proposal itself.
 */
export class ProposalCodeRequired extends Error {
  constructor(
    public agencyName: string,
    public title: string,
    public emailHint: string,
  ) {
    super("Enter the code we emailed to open this proposal.");
    this.name = "ProposalCodeRequired";
  }
}

/** binx-api's 403 `email_code_required`, as a ProposalCodeRequired. */
export function codeRequiredFrom(error: unknown): ProposalCodeRequired | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) {
    return null;
  }
  const data = error.response.data as {
    code?: string;
    details?: { agency_name?: string; title?: string; email_hint?: string };
  } | null;
  if (data?.code !== "email_code_required") return null;
  return new ProposalCodeRequired(
    data.details?.agency_name ?? "",
    data.details?.title ?? "",
    data.details?.email_hint ?? "the recipient",
  );
}
