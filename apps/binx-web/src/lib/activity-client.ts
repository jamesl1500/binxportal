/**
 * activity-client.ts
 *
 * Client-safe slice of the activity-log data layer: the category union and its
 * display metadata. Kept out of `lib/activity.ts` so Client Components (the
 * feed, its filter chips) can import it without dragging in `next/headers`.
 * Relative-time formatting is shared from `lib/notifications-client`.
 *
 * @module apps/binx-web/src/lib/activity-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's activity/models.py category constants. */
export type ActivityCategory = "team" | "clients" | "projects" | "invoicing" | "settings" | "security";

/** The categories that appear on the agency-wide feed (security is account-only). */
export const AGENCY_ACTIVITY_CATEGORIES: Exclude<ActivityCategory, "security">[] = [
  "team",
  "clients",
  "projects",
  "invoicing",
  "settings",
];

export interface ActivityCategoryMeta {
  label: string;
  accent: string;
}

export const ACTIVITY_CATEGORY_META: Record<ActivityCategory, ActivityCategoryMeta> = {
  team: { label: "Team", accent: "var(--color-accent)" },
  clients: { label: "Clients", accent: "#2f7de0" },
  projects: { label: "Projects", accent: "#7c5cff" },
  invoicing: { label: "Invoicing", accent: "#0f9d58" },
  settings: { label: "Settings", accent: "#8a8f98" },
  security: { label: "Security", accent: "#d9534f" },
};
