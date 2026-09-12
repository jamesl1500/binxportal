/**
 * ai.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/ai/*` endpoints
 * (settings, usage, the dashboard briefing, the "Ask AI" conversations) plus
 * the project-summary and invoice-reminder drafts that ride the projects and
 * invoicing routers. Same shape as `lib/leads.ts`: attach the existing
 * access token, map errors to `AuthApiError` — a 503 ("AI isn't configured")
 * or 429 (budget/cap exceeded) both surface as a normal, readable message.
 *
 * @module apps/binx-web/src/lib/ai.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { AiFeature, AiUsageStatus } from "@/lib/ai-client";

export type { AiFeature, AiUsageStatus };

export type AiSettings = Schemas["AiSettingsRead"];

export interface AiSettingsInput {
  isEnabled: boolean;
  monthlyBudgetCents: number;
  dailyUserRequestCap: number;
}

export type AiUsageEvent = Omit<Schemas["AiUsageEventRead"], "feature" | "status"> & {
  feature: AiFeature;
  status: AiUsageStatus;
};

export type AiUsageSummary = Omit<Schemas["AiUsageSummaryRead"], "recent_events"> & {
  recent_events: AiUsageEvent[];
};

export type AiTaskSuggestion = Schemas["AiTaskSuggestion"];
export type AiTaskListSuggestion = Schemas["AiTaskListSuggestion"];
export type AiTaskSuggestions = Schemas["AiTaskSuggestionsRead"];

export type AiConversation = Schemas["AiConversationRead"];

export type AiMessage = Omit<Schemas["AiMessageRead"], "role"> & { role: "user" | "assistant" };

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrow(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  throw error;
}

export async function getAiSettings(agencyId: string): Promise<AiSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AiSettings>(`/agencies/${agencyId}/ai/settings`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load AI settings");
  }
}

export async function updateAiSettings(agencyId: string, input: AiSettingsInput): Promise<AiSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<AiSettings>(
      `/agencies/${agencyId}/ai/settings`,
      {
        is_enabled: input.isEnabled,
        monthly_budget_cents: input.monthlyBudgetCents,
        daily_user_request_cap: input.dailyUserRequestCap,
      },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to update AI settings");
  }
}

export async function getAiUsage(agencyId: string): Promise<AiUsageSummary> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AiUsageSummary>(`/agencies/${agencyId}/ai/usage`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load AI usage");
  }
}

/**
 * getAiBriefing
 *
 * The dashboard's AI briefing — cached server-side per (agency, member, UTC
 * day), so a plain call here is free and instant after the first one today.
 * Pass `force: true` (the card's Refresh button) to regenerate.
 *
 * @function getAiBriefing
 */
export async function getAiBriefing(agencyId: string, force = false): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<{ briefing: string }>(`/agencies/${agencyId}/ai/briefing`, {
      headers,
      params: { refresh: force || undefined },
    });
    return data.briefing;
  } catch (error) {
    rethrow(error, "Unable to generate a briefing");
  }
}

export async function generateProjectSummary(agencyId: string, projectId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ draft: string }>(
      `/agencies/${agencyId}/projects/${projectId}/ai/summary`,
      undefined,
      { headers },
    );
    return data.draft;
  } catch (error) {
    rethrow(error, "Unable to draft a summary");
  }
}

export async function generateInvoiceReminder(agencyId: string, invoiceId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ draft: string }>(
      `/agencies/${agencyId}/invoices/${invoiceId}/ai/reminder`,
      undefined,
      { headers },
    );
    return data.draft;
  } catch (error) {
    rethrow(error, "Unable to draft a reminder");
  }
}

export async function draftMessageReply(agencyId: string, conversationId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ draft: string }>(
      `/agencies/${agencyId}/conversations/${conversationId}/ai/draft-reply`,
      undefined,
      { headers },
    );
    return data.draft;
  } catch (error) {
    rethrow(error, "Unable to draft a reply");
  }
}

export async function suggestProjectTasks(agencyId: string, projectId: string): Promise<AiTaskSuggestions> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<AiTaskSuggestions>(
      `/agencies/${agencyId}/projects/${projectId}/ai/tasks`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to suggest a starter task list");
  }
}

export async function applyProjectTaskSuggestions(
  agencyId: string,
  projectId: string,
  suggestions: AiTaskSuggestions,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.post(`/agencies/${agencyId}/projects/${projectId}/ai/tasks/apply`, suggestions, { headers });
  } catch (error) {
    rethrow(error, "Unable to set up the task list");
  }
}

export async function generateLeadFollowup(agencyId: string, leadId: string): Promise<string> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ draft: string }>(
      `/agencies/${agencyId}/leads/${leadId}/ai/follow-up`,
      undefined,
      { headers },
    );
    return data.draft;
  } catch (error) {
    rethrow(error, "Unable to draft a follow-up");
  }
}

export async function listAiConversations(agencyId: string): Promise<AiConversation[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AiConversation[]>(`/agencies/${agencyId}/ai/conversations`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load conversations");
  }
}

export async function createAiConversation(agencyId: string): Promise<AiConversation> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<AiConversation>(`/agencies/${agencyId}/ai/conversations`, undefined, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to start a new conversation");
  }
}

export async function getAiConversationMessages(agencyId: string, conversationId: string): Promise<AiMessage[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AiMessage[]>(
      `/agencies/${agencyId}/ai/conversations/${conversationId}/messages`,
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this conversation");
  }
}

export async function sendAiMessage(agencyId: string, conversationId: string, message: string): Promise<AiMessage> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<AiMessage>(
      `/agencies/${agencyId}/ai/conversations/${conversationId}/messages`,
      { message },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to send that message");
  }
}

export async function deleteAiConversation(agencyId: string, conversationId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/ai/conversations/${conversationId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete this conversation");
  }
}
