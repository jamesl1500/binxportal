/**
 * actions.ts - Proposal templates
 *
 * Server actions for the templates pages, the template editor and "Save as
 * template" on a proposal. Each returns `{ error?, ... }` like the proposal
 * actions.
 *
 * @module apps/binx-web/src/app/(app)/proposals/templates/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import type { ProposalAttachment } from "@/lib/proposals";
import {
  createProposalTemplate,
  deleteProposalTemplate,
  deleteProposalTemplateAttachment,
  type ProposalTemplate,
  type ProposalTemplateInput,
  saveProposalAsTemplate,
  updateProposalTemplate,
  uploadProposalTemplateAttachment,
} from "@/lib/proposal-templates";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface TemplateActionResult {
  error?: string;
  template?: ProposalTemplate;
}

export async function createTemplateAction(
  agencyId: string,
  input: ProposalTemplateInput,
): Promise<TemplateActionResult> {
  try {
    return { template: await createProposalTemplate(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to save the template");
  }
}

export async function updateTemplateAction(
  agencyId: string,
  templateId: string,
  input: ProposalTemplateInput,
): Promise<TemplateActionResult> {
  try {
    const template = await updateProposalTemplate(agencyId, templateId, input);
    refresh();
    return { template };
  } catch (error) {
    return errorResult(error, "Unable to save the template");
  }
}

export async function deleteTemplateAction(
  agencyId: string,
  templateId: string,
): Promise<{ error?: string }> {
  try {
    await deleteProposalTemplate(agencyId, templateId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete the template");
  }
}

export async function saveAsTemplateAction(
  agencyId: string,
  proposalId: string,
  name: string,
  description: string | null,
): Promise<TemplateActionResult> {
  try {
    return { template: await saveProposalAsTemplate(agencyId, proposalId, name, description) };
  } catch (error) {
    return errorResult(error, "Unable to save the template");
  }
}

export async function uploadTemplateAttachmentAction(
  agencyId: string,
  templateId: string,
  formData: FormData,
): Promise<{ error?: string; attachment?: ProposalAttachment }> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Choose a file to attach" };
  }
  try {
    const attachment = await uploadProposalTemplateAttachment(agencyId, templateId, file);
    refresh();
    return { attachment };
  } catch (error) {
    return errorResult(error, "Unable to attach that file");
  }
}

export async function deleteTemplateAttachmentAction(
  agencyId: string,
  templateId: string,
  attachmentId: string,
): Promise<{ error?: string }> {
  try {
    await deleteProposalTemplateAttachment(agencyId, templateId, attachmentId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to remove that file");
  }
}
