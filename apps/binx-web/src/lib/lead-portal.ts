/**
 * lead-portal.ts
 *
 * Server-only helpers for lead portals: the staff side
 * (`/agencies/{agencyId}/leads/{leadId}/portal`: turn it on, welcome note,
 * reset the link, reply to questions) and the public side
 * (`/lead-portal/{token}`: what the lead sees, and asking a question). See
 * binx-api's modules/lead_portal.
 *
 * @module apps/binx-web/src/lib/lead-portal.ts
 * @author Binx Portal
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

export type LeadPortal = Schemas["LeadPortalRead"];
export type LeadPortalMessage = Schemas["LeadPortalMessageRead"];
export type PublicLeadPortal = Schemas["PublicLeadPortalRead"];

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

const base = (agencyId: string, leadId: string) =>
  `/agencies/${agencyId}/leads/${leadId}/portal`;

export async function getLeadPortal(
  agencyId: string,
  leadId: string,
): Promise<LeadPortal> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<LeadPortal>(base(agencyId, leadId), {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the lead portal");
  }
}

/** Turns the portal on (or keeps it on) with this welcome note. 402 below Starter. */
export async function enableLeadPortal(
  agencyId: string,
  leadId: string,
  welcomeMessage: string | null,
): Promise<LeadPortal> {
  const headers = await authHeader();
  try {
    const { data } = await api.put<LeadPortal>(
      base(agencyId, leadId),
      { welcome_message: welcomeMessage },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to turn on the lead portal");
  }
}

export async function disableLeadPortal(
  agencyId: string,
  leadId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(base(agencyId, leadId), { headers });
  } catch (error) {
    throw apiError(error, "Unable to turn off the lead portal");
  }
}

export async function resetLeadPortalLink(
  agencyId: string,
  leadId: string,
): Promise<LeadPortal> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<LeadPortal>(
      `${base(agencyId, leadId)}/reset-link`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to reset the link");
  }
}

export async function replyInLeadPortal(
  agencyId: string,
  leadId: string,
  body: string,
): Promise<LeadPortalMessage> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<LeadPortalMessage>(
      `${base(agencyId, leadId)}/messages`,
      { body },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send your reply");
  }
}

// ---- Public (the lead, by link) ----

export async function getPublicLeadPortal(
  token: string,
): Promise<PublicLeadPortal> {
  try {
    const { data } = await api.get<PublicLeadPortal>(`/lead-portal/${token}`);
    return data;
  } catch (error) {
    throw apiError(error, "This page isn't available");
  }
}

export async function askInLeadPortal(
  token: string,
  body: string,
  authorName: string | null,
): Promise<LeadPortalMessage> {
  try {
    const { data } = await api.post<LeadPortalMessage>(
      `/lead-portal/${token}/messages`,
      { body, author_name: authorName },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to send your question");
  }
}
