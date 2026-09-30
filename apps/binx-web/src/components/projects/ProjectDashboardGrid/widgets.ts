/**
 * widgets.ts
 *
 * The per-project dashboard's (`/projects/[projectId]`) customizable widgets:
 * the canonical ids in default order, the short default layout a staff
 * member sees before customizing, and each widget's display metadata. Keep
 * the ids and defaults in sync with `PROJECT_DASHBOARD_*` in
 * apps/binx-api/src/binx_api/modules/users/schemas.py — the backend rejects
 * any id outside that set.
 *
 * @module apps/binx-web/src/components/projects/ProjectDashboardGrid/widgets.ts
 * @author Binx.io
 */

export const PROJECT_WIDGET_IDS = [
  "overview",
  "my_tasks",
  "board",
  "team",
  "meetings",
  "ai_summary",
  "files",
] as const;

export type ProjectWidgetId = (typeof PROJECT_WIDGET_IDS)[number];

export const DEFAULT_HIDDEN_PROJECT_WIDGETS: ProjectWidgetId[] = ["ai_summary", "files"];
export const DEFAULT_WIDE_PROJECT_WIDGETS: ProjectWidgetId[] = ["overview"];

export interface ProjectWidgetMeta {
  title: string;
  /** One line shown under the title while customizing, so hidden widgets still explain themselves. */
  description: string;
}

export const PROJECT_WIDGET_META: Record<ProjectWidgetId, ProjectWidgetMeta> = {
  overview: { title: "Overview", description: "Client, timeline, progress, and the project brief." },
  my_tasks: { title: "My tasks", description: "Open tasks on this project assigned to you." },
  board: { title: "Board", description: "How many tasks sit in each list." },
  team: { title: "Team", description: "Who's on the project, and their roles." },
  meetings: { title: "Meetings", description: "Upcoming meetings for this project." },
  ai_summary: { title: "AI status update", description: "Draft a client-ready update from the board." },
  files: { title: "Files", description: "The latest briefs, assets, and deliverables." },
};

export function isProjectWidgetId(value: string): value is ProjectWidgetId {
  return (PROJECT_WIDGET_IDS as readonly string[]).includes(value);
}

/** Filters/pads a possibly-stale stored order to exactly the known ids, same rule the backend applies. */
export function normalizeProjectWidgetOrder(order: string[]): ProjectWidgetId[] {
  const known = order.filter(isProjectWidgetId);
  const missing = PROJECT_WIDGET_IDS.filter((id) => !known.includes(id));
  return [...known, ...missing];
}

/** Drops unknown/stale ids from a stored hidden/wide list. */
export function knownProjectWidgetIds(ids: string[]): ProjectWidgetId[] {
  return ids.filter(isProjectWidgetId);
}
