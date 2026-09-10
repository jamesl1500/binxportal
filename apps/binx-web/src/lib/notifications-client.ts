/**
 * notifications-client.ts
 *
 * The client-safe slice of the notifications data layer: the category union
 * and its display metadata (label + accent colour token). Kept separate from
 * `lib/notifications.ts` so Client Components (the header bell, the list) can
 * import it without pulling in `next/headers` via the server-only helpers.
 * Icons live in the components — this stays free of React.
 *
 * @module apps/binx-web/src/lib/notifications-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's notifications/models.py `notification_categories`. */
export type NotificationCategory = "team" | "invoicing" | "projects" | "messages";

export interface NotificationCategoryMeta {
  label: string;
  /** A CSS colour (token var) used for the row's icon chip. */
  accent: string;
}

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, NotificationCategoryMeta> = {
  team: { label: "Team", accent: "var(--color-accent)" },
  invoicing: { label: "Invoicing", accent: "#0f9d58" },
  projects: { label: "Projects", accent: "#7c5cff" },
  messages: { label: "Messages", accent: "#e8833a" },
};

/** Relative time like "3m", "2h", "5d", falling back to a date for anything older than ~30 days. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 2_592_000) return `${Math.round(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
