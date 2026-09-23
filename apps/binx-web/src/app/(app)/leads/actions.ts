/**
 * actions.ts - Leads
 *
 * Server actions for the leads list + detail pages: create, edit, status /
 * owner changes, notes, convert-to-client, the AI analyze pass, and delete.
 * Plain authenticated mutations against `lib/leads.ts`, mirroring
 * `clients/actions.ts`.
 *
 * @module apps/binx-web/src/app/(app)/leads/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { generateLeadFollowup } from "@/lib/ai";
import type { AgencyClient } from "@/lib/clients";
import { AuthApiError } from "@/lib/auth";
import type { LeadStatus } from "@/lib/leads-client";
import {
  type BulkAnalyzeResult,
  type ImportLeadsResult,
  type Lead,
  type LeadEvent,
  type LeadGenerateBrief,
  type LeadInput,
  type LeadSearchCriteria,
  type LeadSearchCriteriaInput,
  type ProspectCandidate,
  addLeadNote,
  analyzeLead,
  analyzeOpenLeads,
  assignLeadOwner,
  changeLeadStatus,
  convertLead,
  createLead,
  createLeadSearchCriteria,
  deleteLead,
  deleteLeadSearchCriteria,
  generateLeads,
  getLeadSearchCriteria,
  importLeads,
  updateLead,
  updateLeadSearchCriteria,
} from "@/lib/leads";

export interface LeadResult {
  error?: string;
  lead?: Lead;
}

function fail(error: unknown, fallback: string): { error: string } {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function createLeadAction(agencyId: string, input: LeadInput): Promise<LeadResult> {
  try {
    return { lead: await createLead(agencyId, input) };
  } catch (error) {
    return fail(error, "Unable to create the lead");
  }
}

export async function updateLeadAction(agencyId: string, leadId: string, input: LeadInput): Promise<LeadResult> {
  try {
    return { lead: await updateLead(agencyId, leadId, input) };
  } catch (error) {
    return fail(error, "Unable to update the lead");
  }
}

export async function changeLeadStatusAction(
  agencyId: string,
  leadId: string,
  status: LeadStatus,
  lostReason?: string | null,
): Promise<LeadResult> {
  try {
    return { lead: await changeLeadStatus(agencyId, leadId, status, lostReason) };
  } catch (error) {
    return fail(error, "Unable to change the status");
  }
}

export async function assignLeadOwnerAction(
  agencyId: string,
  leadId: string,
  ownerId: string | null,
): Promise<LeadResult> {
  try {
    return { lead: await assignLeadOwner(agencyId, leadId, ownerId) };
  } catch (error) {
    return fail(error, "Unable to reassign the lead");
  }
}

export async function analyzeLeadAction(agencyId: string, leadId: string): Promise<LeadResult> {
  try {
    return { lead: await analyzeLead(agencyId, leadId) };
  } catch (error) {
    return fail(error, "Unable to analyze the lead");
  }
}

export interface LeadFollowupActionResult {
  error?: string;
  draft?: string;
}

export async function generateLeadFollowupAction(agencyId: string, leadId: string): Promise<LeadFollowupActionResult> {
  try {
    return { draft: await generateLeadFollowup(agencyId, leadId) };
  } catch (error) {
    return fail(error, "Unable to draft a follow-up");
  }
}

export interface BulkAnalyzeActionResult {
  error?: string;
  result?: BulkAnalyzeResult;
}

export async function analyzeOpenLeadsAction(agencyId: string): Promise<BulkAnalyzeActionResult> {
  try {
    return { result: await analyzeOpenLeads(agencyId) };
  } catch (error) {
    return fail(error, "Unable to analyze the pipeline");
  }
}

export interface GenerateLeadsActionResult {
  error?: string;
  candidates?: ProspectCandidate[];
}

export async function generateLeadsAction(
  agencyId: string,
  brief: LeadGenerateBrief,
): Promise<GenerateLeadsActionResult> {
  try {
    return { candidates: await generateLeads(agencyId, brief) };
  } catch (error) {
    return fail(error, "Unable to find leads");
  }
}

export interface ImportLeadsActionResult {
  error?: string;
  result?: ImportLeadsResult;
}

export async function importLeadsAction(
  agencyId: string,
  candidates: ProspectCandidate[],
): Promise<ImportLeadsActionResult> {
  try {
    return { result: await importLeads(agencyId, candidates) };
  } catch (error) {
    return fail(error, "Unable to import the leads");
  }
}

export interface AddNoteResult {
  error?: string;
  event?: LeadEvent;
}

export async function addLeadNoteAction(agencyId: string, leadId: string, body: string): Promise<AddNoteResult> {
  try {
    return { event: await addLeadNote(agencyId, leadId, body) };
  } catch (error) {
    return fail(error, "Unable to add the note");
  }
}

export interface ConvertResult {
  error?: string;
  client?: AgencyClient;
}

export async function convertLeadAction(agencyId: string, leadId: string): Promise<ConvertResult> {
  let client: AgencyClient;
  try {
    client = await convertLead(agencyId, leadId);
  } catch (error) {
    return fail(error, "Unable to convert the lead");
  }
  redirect(`/clients/${client.id}`);
}

export interface DeleteLeadResult {
  error?: string;
}

export async function deleteLeadAction(agencyId: string, leadId: string): Promise<DeleteLeadResult> {
  try {
    await deleteLead(agencyId, leadId);
  } catch (error) {
    return fail(error, "Unable to delete the lead");
  }
  redirect("/leads");
}

export interface SearchCriteriaListResult {
  error?: string;
  criteria?: LeadSearchCriteria[];
}

export async function getLeadSearchCriteriaAction(agencyId: string): Promise<SearchCriteriaListResult> {
  try {
    return { criteria: await getLeadSearchCriteria(agencyId) };
  } catch (error) {
    return fail(error, "Unable to load saved searches");
  }
}

export interface SearchCriteriaResult {
  error?: string;
  criteria?: LeadSearchCriteria;
}

export async function createLeadSearchCriteriaAction(
  agencyId: string,
  input: LeadSearchCriteriaInput,
): Promise<SearchCriteriaResult> {
  try {
    return { criteria: await createLeadSearchCriteria(agencyId, input) };
  } catch (error) {
    return fail(error, "Unable to save this search");
  }
}

export async function updateLeadSearchCriteriaAction(
  agencyId: string,
  criteriaId: string,
  input: LeadSearchCriteriaInput,
): Promise<SearchCriteriaResult> {
  try {
    return { criteria: await updateLeadSearchCriteria(agencyId, criteriaId, input) };
  } catch (error) {
    return fail(error, "Unable to update this saved search");
  }
}

export interface DeleteSearchCriteriaResult {
  error?: string;
}

export async function deleteLeadSearchCriteriaAction(
  agencyId: string,
  criteriaId: string,
): Promise<DeleteSearchCriteriaResult> {
  try {
    await deleteLeadSearchCriteria(agencyId, criteriaId);
  } catch (error) {
    return fail(error, "Unable to delete this saved search");
  }
  return {};
}
