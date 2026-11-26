/**
 * proposals.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/proposals/*`
 * (authenticated, staff-side) and `/proposals/public/*` (unauthenticated,
 * token-scoped) endpoints. Money is integer cents; percentages/quantities
 * are decimal strings, same convention as `lib/invoicing.ts`.
 *
 * @module apps/binx-web/src/lib/proposals.ts
 * @author Binx Portal
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
    return new AuthApiError(
      extractDetailMessage(error.response.data, fallback),
      error.response.status,
    );
  }
  return error;
}

// ---- Types ----

export type Proposal = Schemas["ProposalRead"];
export type ProposalDetail = Schemas["ProposalDetailRead"];
export type ProposalLineItem = Schemas["ProposalLineItemRead"];
export type ProposalSignature = Schemas["ProposalSignatureRead"];
export type ProposalPublic = Schemas["ProposalPublicRead"];
export type ProposalAttachment = Schemas["ProposalAttachmentRead"];
export type ProposalEvent = Schemas["ProposalEventRead"];
export type ProposalCertificate = Schemas["ProposalCertificateRead"];

export interface ProposalLineItemInput {
  description: string;
  /** Longer copy shown to the client under the line. */
  details?: string | null;
  quantity: string;
  unitPriceCents: number;
  /** The catalog service the line was picked from, if any. */
  serviceId?: string | null;
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
  /** The agency countersigns after the client (owner/admin). */
  requiresCountersign?: boolean;
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
    requires_countersign: input.requiresCountersign ?? false,
    line_items: input.lineItems.map((item) => ({
      description: item.description,
      details: item.details ?? null,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      service_id: item.serviceId ?? null,
    })),
  };
}

// ---- Staff (authenticated) ----

export interface ProposalFilter {
  leadId?: string;
  clientId?: string;
  status?: string;
}

export async function getProposals(
  agencyId: string,
  filter: ProposalFilter = {},
): Promise<Proposal[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Proposal[]>(
      `/agencies/${agencyId}/proposals`,
      {
        headers,
        params: {
          lead_id: filter.leadId,
          client_id: filter.clientId,
          status: filter.status,
        },
      },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load proposals");
  }
}

export async function getProposal(
  agencyId: string,
  proposalId: string,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalDetail>(
      `/agencies/${agencyId}/proposals/${proposalId}`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load proposal");
  }
}

export async function createProposal(
  agencyId: string,
  input: ProposalInput,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalDetail>(
      `/agencies/${agencyId}/proposals`,
      toPayload(input),
      { headers },
    );
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
    const { data } = await api.patch<ProposalDetail>(
      `/agencies/${agencyId}/proposals/${proposalId}`,
      toPayload(input),
      {
        headers,
      },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update proposal");
  }
}

export async function deleteProposal(
  agencyId: string,
  proposalId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/proposals/${proposalId}`, {
      headers,
    });
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

// ---- Attachments (staff, drafts only) ----

/**
 * `POST /agencies/{agencyId}/proposals/{proposalId}/attachments`: one file
 * per call. binx-api refuses once the proposal is sent, over its size cap,
 * or past its per-proposal count.
 */
export async function uploadProposalAttachment(
  agencyId: string,
  proposalId: string,
  file: File,
): Promise<ProposalAttachment> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  try {
    // Dropping Content-Type lets axios set the multipart boundary (see
    // lib/messaging.ts's sendMessage).
    const { data } = await api.post<ProposalAttachment>(
      `/agencies/${agencyId}/proposals/${proposalId}/attachments`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to attach that file");
  }
}

export async function deleteProposalAttachment(
  agencyId: string,
  proposalId: string,
  attachmentId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(
      `/agencies/${agencyId}/proposals/${proposalId}/attachments/${attachmentId}`,
      { headers },
    );
  } catch (error) {
    throw apiError(error, "Unable to remove that file");
  }
}

// ---- Public (unauthenticated, token-scoped) ----

export async function getPublicProposal(
  token: string,
): Promise<ProposalPublic> {
  try {
    const { data } = await api.get<ProposalPublic>(
      `/proposals/public/${token}`,
    );
    return data;
  } catch (error) {
    throw apiError(error, "This proposal link is invalid or has expired");
  }
}

/**
 * `POST /proposals/public/{token}/sign`. `consent` is the signer's tick on
 * the e-sign consent statement; `documentHash` is the fingerprint of the
 * version they were shown. binx-api refuses either missing or mismatched.
 */
export async function signPublicProposal(
  token: string,
  signerName: string,
  signerEmail: string,
  consent: boolean,
  documentHash: string | null,
): Promise<ProposalPublic> {
  try {
    const { data } = await api.post<ProposalPublic>(
      `/proposals/public/${token}/sign`,
      {
        signer_name: signerName,
        signer_email: signerEmail,
        consent,
        document_hash: documentHash,
      },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to sign this proposal");
  }
}

export async function declinePublicProposal(
  token: string,
  reason: string | null,
): Promise<ProposalPublic> {
  try {
    const { data } = await api.post<ProposalPublic>(
      `/proposals/public/${token}/decline`,
      { reason },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to decline this proposal");
  }
}

/** The signing certificate for a signed proposal, by share token. */
export async function getPublicCertificate(
  token: string,
): Promise<ProposalCertificate> {
  try {
    const { data } = await api.get<ProposalCertificate>(
      `/proposals/public/${token}/certificate`,
    );
    return data;
  } catch (error) {
    throw apiError(error, "This signing certificate isn't available");
  }
}

// ---- Signing record (staff) ----

/** The audit trail: sent, each view, signed or declined, with IP and browser. */
export async function getProposalEvents(
  agencyId: string,
  proposalId: string,
): Promise<ProposalEvent[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalEvent[]>(
      `/agencies/${agencyId}/proposals/${proposalId}/events`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the proposal's history");
  }
}

export async function getProposalCertificate(
  agencyId: string,
  proposalId: string,
): Promise<ProposalCertificate> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalCertificate>(
      `/agencies/${agencyId}/proposals/${proposalId}/certificate`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "This signing certificate isn't available");
  }
}

/**
 * `POST /agencies/{agencyId}/proposals/{proposalId}/countersign`: the
 * agency's signature after the client's. Owners/admins only; needs consent
 * and the fingerprint of the version the client signed.
 */
export async function countersignProposal(
  agencyId: string,
  proposalId: string,
  consent: boolean,
  documentHash: string | null,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalDetail>(
      `/agencies/${agencyId}/proposals/${proposalId}/countersign`,
      { consent, document_hash: documentHash },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to countersign this proposal");
  }
}
