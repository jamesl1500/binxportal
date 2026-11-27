/**
 * proposal-templates.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/proposal-templates`
 * (saved starting points for new proposals: the terms, lines, packages and
 * add-ons, what accepting it does, and documents) and
 * `POST /agencies/{agencyId}/proposals/{id}/save-as-template`.
 *
 * A template's contents use the same shape as a proposal's, so the editor
 * builds a `ProposalInput` and this file strips who-it's-for from it.
 *
 * @module apps/binx-web/src/lib/proposal-templates.ts
 * @author Binx Portal
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import { type ProposalAttachment, type ProposalInput, toPayload } from "@/lib/proposals";

export type ProposalTemplateSummary = Schemas["ProposalTemplateSummaryRead"];
export type ProposalTemplate = Schemas["ProposalTemplateRead"];

export interface ProposalTemplateInput {
  name: string;
  description: string | null;
  /** The proposal-shaped contents; who it's for is ignored. */
  terms: ProposalInput;
  /** How long proposals made from it stay open, in days. */
  validForDays: number | null;
}

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

// A proposal's fields that say who it's for: a template never holds them.
const WHO_ITS_FOR = ["lead_id", "client_id", "recipient_name", "recipient_email", "valid_until", "template_id"];

/** The request body: the proposal payload without who it's for. */
export function toTemplatePayload(input: ProposalTemplateInput) {
  const terms: Record<string, unknown> = { ...toPayload(input.terms) };
  for (const key of WHO_ITS_FOR) delete terms[key];
  return {
    name: input.name,
    description: input.description,
    data: { ...terms, valid_for_days: input.validForDays },
  };
}

const base = (agencyId: string) => `/agencies/${agencyId}/proposal-templates`;

export async function getProposalTemplates(
  agencyId: string,
): Promise<ProposalTemplateSummary[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalTemplateSummary[]>(base(agencyId), { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load templates");
  }
}

export async function getProposalTemplate(
  agencyId: string,
  templateId: string,
): Promise<ProposalTemplate> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ProposalTemplate>(`${base(agencyId)}/${templateId}`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load that template");
  }
}

export async function createProposalTemplate(
  agencyId: string,
  input: ProposalTemplateInput,
): Promise<ProposalTemplate> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalTemplate>(base(agencyId), toTemplatePayload(input), { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to save the template");
  }
}

export async function updateProposalTemplate(
  agencyId: string,
  templateId: string,
  input: ProposalTemplateInput,
): Promise<ProposalTemplate> {
  const headers = await authHeader();
  try {
    const { data } = await api.put<ProposalTemplate>(
      `${base(agencyId)}/${templateId}`,
      toTemplatePayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to save the template");
  }
}

export async function deleteProposalTemplate(agencyId: string, templateId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${base(agencyId)}/${templateId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete the template");
  }
}

export async function uploadProposalTemplateAttachment(
  agencyId: string,
  templateId: string,
  file: File,
): Promise<ProposalAttachment> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);
  try {
    // Dropping Content-Type lets axios set the multipart boundary.
    const { data } = await api.post<ProposalAttachment>(
      `${base(agencyId)}/${templateId}/attachments`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to attach that file");
  }
}

export async function deleteProposalTemplateAttachment(
  agencyId: string,
  templateId: string,
  attachmentId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${base(agencyId)}/${templateId}/attachments/${attachmentId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to remove that file");
  }
}

export async function saveProposalAsTemplate(
  agencyId: string,
  proposalId: string,
  name: string,
  description: string | null,
): Promise<ProposalTemplate> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ProposalTemplate>(
      `/agencies/${agencyId}/proposals/${proposalId}/save-as-template`,
      { name, description },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to save the template");
  }
}
