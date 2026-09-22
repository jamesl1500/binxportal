/**
 * proposals.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/proposals/*`
 * (authenticated, staff-side) and `/proposals/public/*` (unauthenticated,
 * token-scoped) endpoints. Money is integer cents; percentages/quantities
 * are decimal strings, same convention as `lib/invoicing.ts`.
 *
 * @module apps/binx-web/src/lib/proposals.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

// ---- Types ----

export type Proposal = Schemas["ProposalRead"];
export type ProposalDetail = Schemas["ProposalDetailRead"];
export type ProposalLineItem = Schemas["ProposalLineItemRead"];
export type ProposalSignature = Schemas["ProposalSignatureRead"];
export type ProposalPublic = Schemas["ProposalPublicRead"];

export interface ProposalLineItemInput {
  description: string;
  quantity: string;
  unitPriceCents: number;
}

export interface ProposalInput {
  leadId: string | null;
  clientId: string | null;
  title: string;
  recipientName: string | null;
  recipientEmail: string | null;
  content: string | null;
  currency: string;
  taxRatePercent: string;
  validUntil: string | null;
  lineItems: ProposalLineItemInput[];
}

function toPayload(input: ProposalInput) {
  return {
    lead_id: input.leadId,
    client_id: input.clientId,
    title: input.title,
    recipient_name: input.recipientName,
    recipient_email: input.recipientEmail,
    content: input.content,
    currency: input.currency,
    tax_rate_percent: input.taxRatePercent,
    valid_until: input.validUntil,
    line_items: input.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
    })),
  };
}

// ---- Staff (authenticated) ----

export interface ProposalFilter {
  leadId?: string;
  clientId?: string;
  status?: string;
}

export async function getProposals(agencyId: string, filter: ProposalFilter = {}): Promise<Proposal[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Proposal[]>(`/agencies/${agencyId}/proposals`, {
      headers,
      params: { lead_id: filter.leadId, client_id: filter.clientId, status: filter.status },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load proposals");
  }
}

export async function getProposal(agencyId: string, proposalId: string): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalDetail>(`/agencies/${agencyId}/proposals/${proposalId}`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load proposal");
  }
}

export async function createProposal(agencyId: string, input: ProposalInput): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalDetail>(`/agencies/${agencyId}/proposals`, toPayload(input), { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create proposal");
  }
}

export async function updateProposal(
  agencyId: string,
  proposalId: string,
  input: ProposalInput,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<ProposalDetail>(`/agencies/${agencyId}/proposals/${proposalId}`, toPayload(input), {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update proposal");
  }
}

export async function deleteProposal(agencyId: string, proposalId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/proposals/${proposalId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete proposal");
  }
}

export async function sendProposal(
  agencyId: string,
  proposalId: string,
  recipientEmail: string | null,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalDetail>(
      `/agencies/${agencyId}/proposals/${proposalId}/send`,
      { recipient_email: recipientEmail },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send proposal");
  }
}

// ---- Public (unauthenticated, token-scoped) ----

export async function getPublicProposal(token: string): Promise<ProposalPublic> {
  try {
    const { data } = await api.get<ProposalPublic>(`/proposals/public/${token}`);
    return data;
  } catch (error) {
    throw apiError(error, "This proposal link is invalid or has expired");
  }
}

export async function signPublicProposal(
  token: string,
  signerName: string,
  signerEmail: string,
): Promise<ProposalPublic> {
  try {
    const { data } = await api.post<ProposalPublic>(`/proposals/public/${token}/sign`, {
      signer_name: signerName,
      signer_email: signerEmail,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to sign this proposal");
  }
}

export async function declinePublicProposal(token: string, reason: string | null): Promise<ProposalPublic> {
  try {
    const { data } = await api.post<ProposalPublic>(`/proposals/public/${token}/decline`, { reason });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to decline this proposal");
  }
}

