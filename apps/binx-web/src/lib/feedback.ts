/**
 * feedback.ts
 *
 * Server-only helpers for binx-api's product-feedback endpoints: submitting
 * (`/feedback`), the new-account check-in pulse (`/feedback/pulse`), and the
 * Binx team's triage inbox (`/admin/feedback`, platform admins only). Same
 * shape as `lib/leads.ts`: attach the access token, map errors to
 * `AuthApiError`.
 *
 * @module apps/binx-web/src/lib/feedback.ts
 * @author Binx Portal
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type {
  FeedbackAdminFilter,
  FeedbackAdminItem,
  FeedbackInput,
  FeedbackItem,
  FeedbackStatus,
  FeedbackSummary,
  PulseAnswerInput,
} from "@/lib/feedback-client";

export type * from "@/lib/feedback-client";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrow(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(
      extractDetailMessage(error.response.data, fallback),
      error.response.status,
    );
  }
  throw error;
}

function contextPayload(input: {
  pagePath: string | null;
  userAgent: string | null;
  viewport: string | null;
}) {
  return {
    page_path: input.pagePath,
    user_agent: input.userAgent,
    viewport: input.viewport,
  };
}

export async function submitFeedback(
  input: FeedbackInput,
): Promise<FeedbackItem> {
  try {
    const { data } = await api.post<FeedbackItem>(
      "/feedback",
      {
        surface: input.surface,
        agency_id: input.surface === "app" ? (input.agencyId ?? null) : null,
        kind: input.kind,
        rating: input.rating ?? null,
        message: input.message,
        allow_contact: input.allowContact,
        ...contextPayload(input),
      },
      { headers: await authHeader() },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to send your feedback");
  }
}

export async function getMyFeedback(): Promise<FeedbackItem[]> {
  try {
    const { data } = await api.get<FeedbackItem[]>("/feedback/mine", {
      headers: await authHeader(),
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load your feedback");
  }
}

/** The check-in milestone to ask about now, or null. */
export async function getDuePulse(): Promise<string | null> {
  try {
    const { data } = await api.get<{ pulse_key: string | null }>(
      "/feedback/pulse",
      { headers: await authHeader() },
    );
    return data.pulse_key;
  } catch (error) {
    rethrow(error, "Unable to load the check-in");
  }
}

export async function answerPulse(
  pulseKey: string,
  input: PulseAnswerInput,
): Promise<FeedbackItem> {
  try {
    const { data } = await api.post<FeedbackItem>(
      `/feedback/pulse/${encodeURIComponent(pulseKey)}`,
      {
        surface: input.surface,
        agency_id: input.surface === "app" ? (input.agencyId ?? null) : null,
        rating: input.rating,
        message: input.message ?? "",
        ...contextPayload(input),
      },
      { headers: await authHeader() },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to save your check-in");
  }
}

export async function dismissPulse(pulseKey: string): Promise<void> {
  try {
    await api.post(
      `/feedback/pulse/${encodeURIComponent(pulseKey)}/dismiss`,
      null,
      { headers: await authHeader() },
    );
  } catch (error) {
    rethrow(error, "Unable to dismiss the check-in");
  }
}

// ---- Binx team (platform admins) ----------------------------------------

export interface FeedbackAdminPage {
  items: FeedbackAdminItem[];
  total: number;
}

export async function getFeedbackInbox(
  filter: FeedbackAdminFilter = {},
): Promise<FeedbackAdminPage> {
  const params: Record<string, string | number> = {};
  if (filter.status) params.status = filter.status;
  if (filter.kind) params.kind = filter.kind;
  if (filter.surface) params.surface = filter.surface;
  if (filter.q?.trim()) params.q = filter.q.trim();
  if (filter.limit) params.limit = filter.limit;
  if (filter.offset) params.offset = filter.offset;
  try {
    const { data } = await api.get<FeedbackAdminPage>("/admin/feedback", {
      headers: await authHeader(),
      params,
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the feedback inbox");
  }
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  try {
    const { data } = await api.get<FeedbackSummary>("/admin/feedback/summary", {
      headers: await authHeader(),
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the feedback summary");
  }
}

export async function getFeedbackItem(id: string): Promise<FeedbackAdminItem> {
  try {
    const { data } = await api.get<FeedbackAdminItem>(
      `/admin/feedback/${encodeURIComponent(id)}`,
      { headers: await authHeader() },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this feedback");
  }
}

export interface FeedbackTriageInput {
  status?: FeedbackStatus;
  /** "" clears it. */
  response?: string;
  /** "" clears it. */
  internalNote?: string;
}

export async function updateFeedback(
  id: string,
  input: FeedbackTriageInput,
): Promise<FeedbackAdminItem> {
  const body: Record<string, string> = {};
  if (input.status !== undefined) body.status = input.status;
  if (input.response !== undefined) body.response = input.response;
  if (input.internalNote !== undefined) body.internal_note = input.internalNote;
  try {
    const { data } = await api.patch<FeedbackAdminItem>(
      `/admin/feedback/${encodeURIComponent(id)}`,
      body,
      { headers: await authHeader() },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to update this feedback");
  }
}
