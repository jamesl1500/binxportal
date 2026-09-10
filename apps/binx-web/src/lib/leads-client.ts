/**
 * leads-client.ts
 *
 * Client-safe slice of the leads data layer: the status/source unions and
 * their display metadata. Kept out of `lib/leads.ts` so Client Components
 * (the table, status control, timeline) can import it without dragging in
 * `next/headers`.
 *
 * @module apps/binx-web/src/lib/leads-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's leads/models.py LEAD_STATUSES. */
export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
export type LeadSource = "manual" | "referral" | "inbound" | "import" | "ai_generated";

/** The pipeline stages, in order. "won"/"lost" are terminal and handled apart. */
export const LEAD_PIPELINE: LeadStatus[] = ["new", "contacted", "qualified", "proposal"];
export const LEAD_STATUSES: LeadStatus[] = [...LEAD_PIPELINE, "won", "lost"];

export interface LeadStatusMeta {
  label: string;
  accent: string;
  /** An open lead is still being worked (counts toward pipeline stats). */
  open: boolean;
}

export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusMeta> = {
  new: { label: "New", accent: "#8a8f98", open: true },
  contacted: { label: "Contacted", accent: "#2f7de0", open: true },
  qualified: { label: "Qualified", accent: "#7c5cff", open: true },
  proposal: { label: "Proposal", accent: "#d9822b", open: true },
  won: { label: "Won", accent: "#0f9d58", open: false },
  lost: { label: "Lost", accent: "#d9534f", open: false },
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: "Manual",
  referral: "Referral",
  inbound: "Inbound",
  import: "Import",
  ai_generated: "AI generated",
};

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_META[status as LeadStatus]?.label ?? status;
}
