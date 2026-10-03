/**
 * actions.ts - Project Kickoff (staff)
 *
 * Server actions for the project Kickoff tab — plain authenticated
 * mutations, calling binx-api via `lib/kickoffs.ts`. Every action returns
 * `{ error?, ... }`, the same shape the proposals actions use, and revalidates
 * the tab's own path so the server component re-fetches after a mutation.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/kickoff/actions.ts
 * @author Binx Portal
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  convertKickoff,
  createKickoff,
  createKickoffTemplate,
  deleteKickoff,
  type KickoffDetail,
  type KickoffInput,
  type KickoffTemplateInput,
  nudgeKickoff,
  sendKickoff,
  updateKickoff,
} from "@/lib/kickoffs";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface KickoffActionResult {
  error?: string;
  kickoff?: KickoffDetail;
}

export async function createKickoffAction(
  agencyId: string,
  projectId: string,
  input: KickoffInput & { templateId?: string | null },
): Promise<KickoffActionResult> {
  try {
    const kickoff = await createKickoff(agencyId, projectId, input);
    revalidatePath(`/projects/${projectId}/kickoff`);
    return { kickoff };
  } catch (error) {
    return errorResult(error, "Unable to create kickoff");
  }
}

export async function updateKickoffAction(
  agencyId: string,
  projectId: string,
  input: KickoffInput,
): Promise<KickoffActionResult> {
  try {
    const kickoff = await updateKickoff(agencyId, projectId, input);
    revalidatePath(`/projects/${projectId}/kickoff`);
    return { kickoff };
  } catch (error) {
    return errorResult(error, "Unable to update kickoff");
  }
}

export async function deleteKickoffAction(
  agencyId: string,
  projectId: string,
): Promise<{ error?: string }> {
  try {
    await deleteKickoff(agencyId, projectId);
    revalidatePath(`/projects/${projectId}/kickoff`);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete kickoff");
  }
}

export async function sendKickoffAction(
  agencyId: string,
  projectId: string,
): Promise<KickoffActionResult> {
  try {
    const kickoff = await sendKickoff(agencyId, projectId);
    revalidatePath(`/projects/${projectId}/kickoff`);
    revalidatePath(`/projects/${projectId}`);
    return { kickoff };
  } catch (error) {
    return errorResult(error, "Unable to send kickoff");
  }
}

export async function nudgeKickoffAction(
  agencyId: string,
  projectId: string,
): Promise<KickoffActionResult> {
  try {
    const kickoff = await nudgeKickoff(agencyId, projectId);
    revalidatePath(`/projects/${projectId}/kickoff`);
    return { kickoff };
  } catch (error) {
    return errorResult(error, "Unable to send reminder");
  }
}

export async function convertKickoffAction(
  agencyId: string,
  projectId: string,
  listId: string | null,
): Promise<{ error?: string; tasksCreated?: number }> {
  try {
    const result = await convertKickoff(agencyId, projectId, listId);
    revalidatePath(`/projects/${projectId}/kickoff`);
    revalidatePath(`/projects/${projectId}/board`);
    return { tasksCreated: result.tasks_created };
  } catch (error) {
    return errorResult(error, "Unable to convert kickoff to tasks");
  }
}

export async function createKickoffTemplateAction(
  agencyId: string,
  input: KickoffTemplateInput,
): Promise<{ error?: string }> {
  try {
    await createKickoffTemplate(agencyId, input);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to save template");
  }
}
