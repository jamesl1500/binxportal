/**
 * actions.ts - Portal Kickoff
 *
 * Server actions for a client answering their project's kickoff — file
 * upload (one call per file, ahead of the final submit) and the answers
 * submit itself. Same `{ error? }` result shape as every other portal
 * action.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/kickoff/actions.ts
 * @author Binx Portal
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  type PortalKickoff,
  type PortalKickoffAnswerInput,
  submitPortalKickoffAnswers,
  uploadPortalKickoffFile,
} from "@/lib/portal";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export async function uploadPortalKickoffFileAction(
  projectId: string,
  formData: FormData,
): Promise<{ error?: string; fileId?: string; fileName?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first" };
  }
  try {
    const result = await uploadPortalKickoffFile(projectId, file);
    return { fileId: result.file_id, fileName: result.file_name };
  } catch (error) {
    return errorResult(error, "Unable to upload that file");
  }
}

export async function submitPortalKickoffAnswersAction(
  projectId: string,
  answers: PortalKickoffAnswerInput[],
): Promise<{ error?: string; kickoff?: PortalKickoff }> {
  try {
    const kickoff = await submitPortalKickoffAnswers(projectId, answers);
    revalidatePath(`/portal/projects/${projectId}/kickoff`);
    return { kickoff };
  } catch (error) {
    return errorResult(error, "Unable to submit your answers");
  }
}
