/**
 * kickoffs.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/projects/{projectId}/kickoff*`
 * and `/agencies/{agencyId}/kickoff-templates/*` endpoints (authenticated,
 * staff-side). Same shape as `lib/proposals.ts`: plain axios calls attaching
 * the current access token, errors normalized to AuthApiError.
 *
 * @module apps/binx-web/src/lib/kickoffs.ts
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

export type KickoffQuestionType = "text" | "multiple_choice" | "file_upload";

export type KickoffDetail = Schemas["KickoffDetailRead"];
export type KickoffQuestion = Schemas["KickoffQuestionRead"];
export type KickoffAnswer = Schemas["KickoffAnswerRead"];
export type KickoffTemplate = Schemas["KickoffTemplateRead"];
export type KickoffTemplateDetail = Schemas["KickoffTemplateDetailRead"];

export interface KickoffQuestionInput {
  type: KickoffQuestionType;
  label: string;
  options: string[];
  required: boolean;
}

export interface KickoffInput {
  title: string;
  introMessage: string | null;
  questions: KickoffQuestionInput[];
}

function toQuestionsPayload(questions: KickoffQuestionInput[]) {
  return questions.map((q) => ({
    type: q.type,
    label: q.label,
    options: q.options,
    required: q.required,
  }));
}

// ---- Kickoff (project-scoped) ----

export async function getKickoff(
  agencyId: string,
  projectId: string,
): Promise<KickoffDetail | null> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<KickoffDetail>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff`,
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw apiError(error, "Unable to load kickoff");
  }
}

export async function createKickoff(
  agencyId: string,
  projectId: string,
  input: KickoffInput & { templateId?: string | null },
): Promise<KickoffDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<KickoffDetail>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff`,
      {
        title: input.title,
        intro_message: input.introMessage,
        template_id: input.templateId ?? null,
        questions: toQuestionsPayload(input.questions),
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create kickoff");
  }
}

export async function updateKickoff(
  agencyId: string,
  projectId: string,
  input: KickoffInput,
): Promise<KickoffDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<KickoffDetail>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff`,
      {
        title: input.title,
        intro_message: input.introMessage,
        questions: toQuestionsPayload(input.questions),
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update kickoff");
  }
}

export async function deleteKickoff(
  agencyId: string,
  projectId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/kickoff`, {
      headers,
    });
  } catch (error) {
    throw apiError(error, "Unable to delete kickoff");
  }
}

export async function sendKickoff(
  agencyId: string,
  projectId: string,
): Promise<KickoffDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<KickoffDetail>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff/send`,
      {},
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send kickoff");
  }
}

export async function nudgeKickoff(
  agencyId: string,
  projectId: string,
): Promise<KickoffDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<KickoffDetail>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff/nudge`,
      {},
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send reminder");
  }
}

export async function convertKickoff(
  agencyId: string,
  projectId: string,
  listId: string | null,
): Promise<{ tasks_created: number }> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ tasks_created: number }>(
      `/agencies/${agencyId}/projects/${projectId}/kickoff/convert`,
      { list_id: listId },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to convert kickoff to tasks");
  }
}

// ---- Templates ----

export async function getKickoffTemplates(
  agencyId: string,
): Promise<KickoffTemplate[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<KickoffTemplate[]>(
      `/agencies/${agencyId}/kickoff-templates`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load kickoff templates");
  }
}

export async function getKickoffTemplate(
  agencyId: string,
  templateId: string,
): Promise<KickoffTemplateDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<KickoffTemplateDetail>(
      `/agencies/${agencyId}/kickoff-templates/${templateId}`,
      {
        headers,
      },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load kickoff template");
  }
}

export interface KickoffTemplateInput {
  name: string;
  description: string | null;
  questions: KickoffQuestionInput[];
}

export async function createKickoffTemplate(
  agencyId: string,
  input: KickoffTemplateInput,
): Promise<KickoffTemplateDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<KickoffTemplateDetail>(
      `/agencies/${agencyId}/kickoff-templates`,
      {
        name: input.name,
        description: input.description,
        questions: toQuestionsPayload(input.questions),
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create kickoff template");
  }
}

export async function updateKickoffTemplate(
  agencyId: string,
  templateId: string,
  input: KickoffTemplateInput,
): Promise<KickoffTemplateDetail> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<KickoffTemplateDetail>(
      `/agencies/${agencyId}/kickoff-templates/${templateId}`,
      {
        name: input.name,
        description: input.description,
        questions: toQuestionsPayload(input.questions),
      },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update kickoff template");
  }
}

export async function deleteKickoffTemplate(
  agencyId: string,
  templateId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/kickoff-templates/${templateId}`, {
      headers,
    });
  } catch (error) {
    throw apiError(error, "Unable to delete kickoff template");
  }
}
