/**
 * leads.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/leads/*` endpoints
 * — the lightweight CRM. Same shape as `lib/clients.ts`: attach the existing
 * access token, map errors to `AuthApiError`.
 *
 * @module apps/binx-web/src/lib/leads.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { AgencyClient } from "@/lib/clients";
import { leadStatusLabel } from "@/lib/leads-client";
import type { LeadSource, LeadStatus } from "@/lib/leads-client";

export { leadStatusLabel };
export type { LeadSource, LeadStatus };

export interface LeadListItem {
  id: string;
  agency_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  website: string | null;
  status: LeadStatus;
  source: LeadSource;
  owner_id: string | null;
  owner_name: string | null;
  score: number | null;
  estimated_value_cents: number | null;
  last_activity_at: string | null;
  converted_client_id: string | null;
  created_at: string;
}

export interface Lead extends LeadListItem {
  contact_phone: string | null;
  notes: string | null;
  ai_summary: string | null;
  ai_talking_points: string[];
  ai_next_step: string | null;
  ai_fit: "strong" | "moderate" | "weak" | null;
  ai_analyzed_at: string | null;
  lost_reason: string | null;
  converted_client_name: string | null;
  converted_at: string | null;
  updated_at: string | null;
}

export interface LeadGenerateBrief {
  criteriaId?: string;
  industry?: string;
  location?: string;
  radiusMiles?: number;
  companySize?: string;
  keywords?: string;
  count?: number;
}

export type ProspectSource = "google_places" | "web_search" | "both";

export interface ProspectCandidate {
  name: string;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  estimated_value_cents: number | null;
  rationale: string | null;
  source: ProspectSource;
}

export interface LeadSearchCriteria {
  id: string;
  agency_id: string;
  name: string;
  industry: string | null;
  location: string | null;
  radius_miles: number | null;
  company_size: string | null;
  keywords: string | null;
  count: number;
  last_run_at: string | null;
  last_run_result_count: number | null;
  created_at: string;
}

export interface LeadSearchCriteriaInput {
  name: string;
  industry?: string | null;
  location?: string | null;
  radiusMiles?: number | null;
  companySize?: string | null;
  keywords?: string | null;
  count?: number;
}

export interface BulkAnalyzeResult {
  analyzed: number;
  skipped: number;
  leads: LeadListItem[];
}

export interface ImportLeadsResult {
  imported: Lead[];
  skipped: { name: string; reason: string }[];
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  kind: "created" | "note" | "status_changed" | "owner_changed" | "converted" | "analyzed";
  body: string;
  actor_name: string | null;
  created_at: string;
}

export interface LeadInput {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  source?: LeadSource;
  estimatedValueCents?: number | null;
  notes?: string | null;
}

export interface LeadFilter {
  status?: LeadStatus;
  ownerId?: string;
  source?: LeadSource;
}

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

function toPayload(input: LeadInput) {
  return {
    name: input.name,
    contact_name: input.contactName ?? null,
    contact_email: input.contactEmail || null,
    contact_phone: input.contactPhone ?? null,
    website: input.website ?? null,
    source: input.source ?? "manual",
    estimated_value_cents: input.estimatedValueCents ?? null,
    notes: input.notes ?? null,
  };
}

export async function getLeads(agencyId: string, filter: LeadFilter = {}): Promise<LeadListItem[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<LeadListItem[]>(`/agencies/${agencyId}/leads`, {
      headers,
      params: { status: filter.status, owner_id: filter.ownerId, source: filter.source },
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load leads");
  }
}

export async function getLead(agencyId: string, leadId: string): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Lead>(`/agencies/${agencyId}/leads/${leadId}`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load this lead");
  }
}

export async function createLead(agencyId: string, input: LeadInput): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Lead>(`/agencies/${agencyId}/leads`, toPayload(input), { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to create the lead");
  }
}

export async function updateLead(agencyId: string, leadId: string, input: LeadInput): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<Lead>(`/agencies/${agencyId}/leads/${leadId}`, toPayload(input), { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to update the lead");
  }
}

export async function deleteLead(agencyId: string, leadId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/leads/${leadId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete the lead");
  }
}

export async function changeLeadStatus(
  agencyId: string,
  leadId: string,
  status: LeadStatus,
  lostReason?: string | null,
): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<Lead>(
      `/agencies/${agencyId}/leads/${leadId}/status`,
      { status, lost_reason: lostReason ?? null },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to change the status");
  }
}

export async function assignLeadOwner(
  agencyId: string,
  leadId: string,
  ownerId: string | null,
): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<Lead>(
      `/agencies/${agencyId}/leads/${leadId}/owner`,
      { owner_id: ownerId },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to reassign the lead");
  }
}

export async function getLeadEvents(agencyId: string, leadId: string): Promise<LeadEvent[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<LeadEvent[]>(`/agencies/${agencyId}/leads/${leadId}/events`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the timeline");
  }
}

export async function addLeadNote(agencyId: string, leadId: string, body: string): Promise<LeadEvent> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<LeadEvent>(
      `/agencies/${agencyId}/leads/${leadId}/events`,
      { body },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to add the note");
  }
}

export async function convertLead(agencyId: string, leadId: string): Promise<AgencyClient> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<AgencyClient>(
      `/agencies/${agencyId}/leads/${leadId}/convert`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to convert the lead");
  }
}

/** Scores + summarises a lead via a real Claude call (falls back to a completeness heuristic on binx-api if AI isn't available). */
export async function analyzeLead(agencyId: string, leadId: string): Promise<Lead> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Lead>(
      `/agencies/${agencyId}/leads/${leadId}/analyze`,
      undefined,
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to analyze the lead");
  }
}

/** Analyzes every open lead that's unanalyzed or stale, in one pass (capped server-side). */
export async function analyzeOpenLeads(agencyId: string): Promise<BulkAnalyzeResult> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BulkAnalyzeResult>(`/agencies/${agencyId}/leads/analyze`, undefined, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to analyze the pipeline");
  }
}

/**
 * AI prospector: finds real candidate companies for a brief (or, when
 * `criteriaId` is set, for a saved search — the rest of the brief is
 * ignored server-side in that case). Nothing is saved — the caller reviews
 * then imports.
 */
export async function generateLeads(agencyId: string, brief: LeadGenerateBrief): Promise<ProspectCandidate[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<{ candidates: ProspectCandidate[] }>(
      `/agencies/${agencyId}/leads/generate`,
      {
        criteria_id: brief.criteriaId || null,
        industry: brief.industry || null,
        location: brief.location || null,
        radius_miles: brief.radiusMiles || null,
        company_size: brief.companySize || null,
        keywords: brief.keywords || null,
        count: brief.count ?? 5,
      },
      { headers },
    );
    return data.candidates;
  } catch (error) {
    rethrow(error, "Unable to find leads");
  }
}

/** Imports reviewed prospector candidates as leads (source="ai_generated"), skipping duplicates. */
export async function importLeads(agencyId: string, candidates: ProspectCandidate[]): Promise<ImportLeadsResult> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<ImportLeadsResult>(
      `/agencies/${agencyId}/leads/import`,
      { candidates },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to import the leads");
  }
}

function criteriaPayload(input: LeadSearchCriteriaInput) {
  return {
    name: input.name,
    industry: input.industry || null,
    location: input.location || null,
    radius_miles: input.radiusMiles || null,
    company_size: input.companySize || null,
    keywords: input.keywords || null,
    count: input.count ?? 5,
  };
}

/** Lists the agency's saved prospector searches, most recently created first. */
export async function getLeadSearchCriteria(agencyId: string): Promise<LeadSearchCriteria[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<LeadSearchCriteria[]>(`/agencies/${agencyId}/leads/search-criteria`, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load saved searches");
  }
}

export async function createLeadSearchCriteria(
  agencyId: string,
  input: LeadSearchCriteriaInput,
): Promise<LeadSearchCriteria> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<LeadSearchCriteria>(
      `/agencies/${agencyId}/leads/search-criteria`,
      criteriaPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to save this search");
  }
}

export async function updateLeadSearchCriteria(
  agencyId: string,
  criteriaId: string,
  input: LeadSearchCriteriaInput,
): Promise<LeadSearchCriteria> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<LeadSearchCriteria>(
      `/agencies/${agencyId}/leads/search-criteria/${criteriaId}`,
      criteriaPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to update this saved search");
  }
}

export async function deleteLeadSearchCriteria(agencyId: string, criteriaId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`/agencies/${agencyId}/leads/search-criteria/${criteriaId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete this saved search");
  }
}
