/**
 * actions.ts - Agency Settings
 *
 * Server actions for the agency settings pages: renaming the current agency,
 * editing its profile / policies / branding, uploading and clearing the logo
 * and cover images, and permanently deleting the agency. Plain authenticated
 * mutations — binx-api independently re-checks the caller's role within the
 * specific agency (see agencies/dependencies.py's require_agency_role).
 *
 * @module apps/binx-web/src/app/(app)/settings/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { type AiSettings, type AiSettingsInput, getAiUsage, updateAiSettings, type AiUsageSummary } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import {
  type AgencyImageKind,
  type AgencyProfile,
  type AgencyProfileInput,
  clearCurrentAgencyId,
  deleteAgency,
  deleteAgencyImage,
  updateAgency,
  updateAgencyProfile,
  uploadAgencyImage,
} from "@/lib/agencies";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface UpdateAgencyActionResult {
  error?: string;
}

export async function updateAgencyAction(agencyId: string, name: string): Promise<UpdateAgencyActionResult> {
  try {
    await updateAgency(agencyId, name);
  } catch (error) {
    return errorResult(error, "Unable to update agency");
  }
  return {};
}

export interface DeleteAgencyActionResult {
  error?: string;
}

export async function deleteAgencyAction(agencyId: string): Promise<DeleteAgencyActionResult> {
  try {
    await deleteAgency(agencyId);
  } catch (error) {
    return errorResult(error, "Unable to delete agency");
  }

  // Settings always acts on the CURRENT agency, so a successful delete here
  // always means the cookie now points at something that no longer exists.
  await clearCurrentAgencyId();
  redirect("/dashboard");
}

export interface AgencyProfileActionResult {
  error?: string;
  profile?: AgencyProfile;
}

export async function updateAgencyProfileAction(
  agencyId: string,
  input: AgencyProfileInput,
): Promise<AgencyProfileActionResult> {
  try {
    return { profile: await updateAgencyProfile(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to save changes");
  }
}

export async function uploadAgencyImageAction(
  agencyId: string,
  kind: AgencyImageKind,
  formData: FormData,
): Promise<AgencyProfileActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected" };
  }
  try {
    return { profile: await uploadAgencyImage(agencyId, kind, file) };
  } catch (error) {
    return errorResult(error, "Unable to upload image");
  }
}

export async function removeAgencyImageAction(
  agencyId: string,
  kind: AgencyImageKind,
): Promise<AgencyProfileActionResult> {
  try {
    return { profile: await deleteAgencyImage(agencyId, kind) };
  } catch (error) {
    return errorResult(error, "Unable to remove image");
  }
}

export interface AiSettingsActionResult {
  error?: string;
  settings?: AiSettings;
}

export async function updateAiSettingsAction(agencyId: string, input: AiSettingsInput): Promise<AiSettingsActionResult> {
  try {
    return { settings: await updateAiSettings(agencyId, input) };
  } catch (error) {
    return errorResult(error, "Unable to update AI settings");
  }
}

export interface AiUsageActionResult {
  error?: string;
  usage?: AiUsageSummary;
}

export async function refreshAiUsageAction(agencyId: string): Promise<AiUsageActionResult> {
  try {
    return { usage: await getAiUsage(agencyId) };
  } catch (error) {
    return errorResult(error, "Unable to load AI usage");
  }
}
