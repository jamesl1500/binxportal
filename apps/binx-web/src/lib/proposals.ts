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
import {
  codeRequiredFrom,
  proposalAccessHeaders,
} from "@/lib/proposal-access";

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
export type ProposalAcceptance = Schemas["ProposalAcceptanceRead"];
export type ProposalPackage = Schemas["ProposalPackageRead"];
export type ProposalDeposit = Schemas["ProposalDepositRead"];
export type ProposalTemplateData = Schemas["ProposalTemplateData-Output"];

export interface ProposalLineItemInput {
  description: string;
  /** Longer copy shown to the client under the line. */
  details?: string | null;
  quantity: string;
  unitPriceCents: number;
  /** The catalog service the line was picked from, if any. */
  serviceId?: string | null;
  /** A monthly line is a retainer, billed every month once accepted. */
  billing?: "one_time" | "monthly";
  /** The package (by its key in `packages`) the line is in; none: every option. */
  packageKey?: string | null;
  /** An add-on the client can tick or untick; `selected` is its starting state. */
  optional?: boolean;
  selected?: boolean;
}

/** A package the client can choose (one of two to four). */
export interface ProposalPackageInput {
  /** The form's own handle for it, so lines can say which one they're in. */
  key: string;
  name: string;
  description?: string | null;
  /** Selected until the client chooses. */
  recommended?: boolean;
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
  packages?: ProposalPackageInput[];
  /** The agency countersigns after the client (owner/admin). */
  requiresCountersign?: boolean;
  /** Ask for a code emailed to the recipient before it opens. */
  requireEmailCode?: boolean;
  /** What accepting it sets in motion (binx-api proposals/acceptance.py). */
  depositPercent?: string | null;
  createProjectOnAccept?: boolean;
  kickoffTemplateId?: string | null;
  /** Made from this template: binx-api copies its documents on. */
  templateId?: string | null;
}

/** The request body binx-api takes for a proposal (create and update). */
export function toPayload(input: ProposalInput) {
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
    require_email_code: input.requireEmailCode ?? false,
    deposit_percent: input.depositPercent || null,
    create_project_on_accept: input.createProjectOnAccept ?? false,
    kickoff_template_id: input.kickoffTemplateId || null,
    template_id: input.templateId || null,
    line_items: input.lineItems.map((item) => ({
      description: item.description,
      details: item.details ?? null,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      service_id: item.serviceId ?? null,
      billing: item.billing ?? "one_time",
      package_key: item.packageKey ?? null,
      optional: item.optional ?? false,
      selected: item.selected ?? true,
    })),
    packages: (input.packages ?? []).map((pkg) => ({
      key: pkg.key,
      name: pkg.name,
      description: pkg.description ?? null,
      recommended: pkg.recommended ?? false,
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
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw (
      codeRequiredFrom(error) ??
      apiError(error, "This proposal link is invalid or has expired")
    );
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
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to sign this proposal");
  }
}

/**
 * `PUT /proposals/public/{token}/options`: the recipient's package (required
 * when the proposal offers any) and the add-ons they want. The response
 * carries the new document fingerprint to sign against.
 */
export async function choosePublicProposalOptions(
  token: string,
  packageId: string | null,
  addOnIds: string[],
): Promise<ProposalPublic> {
  try {
    const { data } = await api.put<ProposalPublic>(
      `/proposals/public/${token}/options`,
      { package_id: packageId, add_on_ids: addOnIds },
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to save your choice");
  }
}

/**
 * `POST /proposals/public/{token}/deposit/checkout`: a Stripe Checkout
 * Session for the signed proposal's deposit. Returns where to send them.
 */
export async function startPublicDepositCheckout(
  token: string,
): Promise<{ checkout_url: string }> {
  try {
    const { data } = await api.post<{ checkout_url: string }>(
      `/proposals/public/${token}/deposit/checkout`,
      undefined,
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to start the payment");
  }
}

/** `POST /proposals/public/{token}/deposit/confirm`, on the way back from Stripe. */
export async function confirmPublicDeposit(
  token: string,
  sessionId: string,
): Promise<{ outcome: string; proposal: ProposalPublic }> {
  try {
    const { data } = await api.post<{
      outcome: string;
      proposal: ProposalPublic;
    }>(
      `/proposals/public/${token}/deposit/confirm`,
      { session_id: sessionId },
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to check the payment");
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
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to decline this proposal");
  }
}

/**
 * `POST /proposals/public/{token}/code`: emails a code to the proposal's
 * recipient. Returns where it went, masked ("j•••@fjord.example").
 */
export async function requestPublicProposalCode(
  token: string,
): Promise<{ email_hint: string }> {
  try {
    const { data } = await api.post<{ email_hint: string }>(
      `/proposals/public/${token}/code`,
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send a code");
  }
}

/** `POST /proposals/public/{token}/code/verify`: the code, for an access token. */
export async function verifyPublicProposalCode(
  token: string,
  code: string,
): Promise<{ access_token: string; expires_in_seconds: number }> {
  try {
    const { data } = await api.post<{
      access_token: string;
      expires_in_seconds: number;
    }>(`/proposals/public/${token}/code/verify`, { code });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to check that code");
  }
}

/** The signing certificate for a signed proposal, by share token. */
export async function getPublicCertificate(
  token: string,
): Promise<ProposalCertificate> {
  try {
    const { data } = await api.get<ProposalCertificate>(
      `/proposals/public/${token}/certificate`,
      { headers: await proposalAccessHeaders(token) },
    );
    return data;
  } catch (error) {
    throw (
      codeRequiredFrom(error) ??
      apiError(error, "This signing certificate isn't available")
    );
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

/**
 * `POST /agencies/{agencyId}/proposals/{proposalId}/acceptance/retry`:
 * re-runs a blocked acceptance (after a plan upgrade, say), picking up where
 * it stopped.
 */
export async function retryProposalAcceptance(
  agencyId: string,
  proposalId: string,
): Promise<ProposalDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalDetail>(
      `/agencies/${agencyId}/proposals/${proposalId}/acceptance/retry`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to finish setting this client up");
  }
}
