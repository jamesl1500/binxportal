/**
 * proposals-client.ts
 *
 * Client-safe slice of the proposals data layer: the status display labels
 * and the attachment limit. Kept out of `lib/proposals.ts` so Client Components (the table,
 * the proposal view) can import it without dragging in `next/headers` via
 * `lib/auth.ts` — same reasoning as `lib/leads-client.ts`.
 *
 * @module apps/binx-web/src/lib/proposals-client.ts
 * @author Binx Portal
 */

/** Keep in sync with binx-api's proposals/models.py PROPOSAL_STATUSES. */
export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  // The client has signed; the agency's countersignature is still due.
  awaiting_countersign: "Awaiting countersignature",
  declined: "Declined",
  expired: "Expired",
};

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

/** Keep in sync with binx-api's proposals/models.py MAX_PROPOSAL_ATTACHMENTS. */
export const MAX_PROPOSAL_ATTACHMENTS = 10;
