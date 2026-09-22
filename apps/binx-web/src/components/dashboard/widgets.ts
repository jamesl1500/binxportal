/**
 * widgets.ts
 *
 * The staff dashboard's customizable widget grid — the canonical list of
 * widget ids, in their default order, plus the display metadata
 * (`DashboardWidgetGrid` needs to render each section's header) that isn't
 * worth round-tripping through the API. Keep the id list in sync with
 * `DASHBOARD_WIDGET_IDS` in apps/binx-api/src/binx_api/modules/users/schemas.py
 * — the backend rejects any id outside that set.
 *
 * @module apps/binx-web/src/components/dashboard/widgets.ts
 * @author Binx.io
 */

export const DASHBOARD_WIDGET_IDS = [
  "my_tasks",
  "needs_attention",
  "quick_actions",
  "recent_activity",
  "upcoming_meetings",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

export interface DashboardWidgetMeta {
  title: string;
  viewAllHref?: string;
}

export const DASHBOARD_WIDGET_META: Record<DashboardWidgetId, DashboardWidgetMeta> = {
  my_tasks: { title: "My tasks", viewAllHref: "/dashboard/my-work" },
  needs_attention: { title: "Needs attention" },
  quick_actions: { title: "Quick actions" },
  recent_activity: { title: "Recent activity", viewAllHref: "/activity" },
  upcoming_meetings: { title: "Upcoming meetings", viewAllHref: "/meetings" },
};

export function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);
}

/** Filters/pads a possibly-stale stored order to exactly the known ids, same rule the backend applies. */
export function normalizeWidgetOrder(order: string[]): DashboardWidgetId[] {
  const known = order.filter(isDashboardWidgetId);
  const missing = DASHBOARD_WIDGET_IDS.filter((id) => !known.includes(id));
  return [...known, ...missing];
}
