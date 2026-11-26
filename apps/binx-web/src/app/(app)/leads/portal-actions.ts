/**
 * portal-actions.ts - Lead portal (staff)
 *
 * Server actions for a lead's portal card on the lead page: turn it on (or
 * update the welcome note), turn it off, reset its link, and reply to the
 * lead's questions. Each calls `refresh()` so the card re-renders.
 *
 * @module apps/binx-web/src/app/(app)/leads/portal-actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  disableLeadPortal,
  enableLeadPortal,
  replyInLeadPortal,
  resetLeadPortalLink,
} from "@/lib/lead-portal";

export interface LeadPortalActionResult {
  error?: string;
  /** Set when the plan doesn't include lead portals (402). */
  needsUpgrade?: boolean;
}

function errorResult(error: unknown, fallback: string): LeadPortalActionResult {
  if (error instanceof AuthApiError) {
    return { error: error.message, needsUpgrade: error.status === 402 };
  }
  return { error: fallback };
}

export async function enableLeadPortalAction(
  agencyId: string,
  leadId: string,
  welcomeMessage: string | null,
): Promise<LeadPortalActionResult> {
  try {
    await enableLeadPortal(agencyId, leadId, welcomeMessage);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to turn on the lead portal");
  }
}

export async function disableLeadPortalAction(
  agencyId: string,
  leadId: string,
): Promise<LeadPortalActionResult> {
  try {
    await disableLeadPortal(agencyId, leadId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to turn off the lead portal");
  }
}

export async function resetLeadPortalLinkAction(
  agencyId: string,
  leadId: string,
): Promise<LeadPortalActionResult> {
  try {
    await resetLeadPortalLink(agencyId, leadId);
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to reset the link");
  }
}

export async function replyInLeadPortalAction(
  agencyId: string,
  leadId: string,
  body: string,
): Promise<LeadPortalActionResult> {
  if (body.trim() === "") return { error: "Write a reply first" };
  try {
    await replyInLeadPortal(agencyId, leadId, body.trim());
    refresh();
    return {};
  } catch (error) {
    return errorResult(error, "Unable to send your reply");
  }
}
