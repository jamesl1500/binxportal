/**
 * meetings-client.ts
 *
 * Client-safe slice of the meetings data layer: just the `Slot` type and
 * `groupSlotsByLocalDay`, a pure function with no I/O. Kept out of
 * `lib/meetings.ts` so Client Components (BookMeetingDialog) can import it
 * without dragging in `next/headers` — `lib/meetings.ts` re-exports both so
 * server-side callers see no change.
 *
 * @module apps/binx-web/src/lib/meetings-client.ts
 * @author Binx.io
 */
import type { Schemas } from "@/lib/api-types";

export type Slot = Schemas["SlotRead"];

/**
 * groupSlotsByLocalDay
 *
 * Buckets slots by the *viewer's* browser-local calendar day (via
 * `toLocaleDateString`), not the agency's timezone — a client booking from
 * a different zone than the agency needs to see days grouped the way their
 * own calendar would show them. Pure function: pass slots already fetched,
 * no I/O here.
 *
 * @function groupSlotsByLocalDay
 */
export function groupSlotsByLocalDay(slots: Slot[]): Map<string, Slot[]> {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = new Date(slot.starts_at).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const existing = groups.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      groups.set(key, [slot]);
    }
  }
  return groups;
}
