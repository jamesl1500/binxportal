/**
 * projects-client.ts
 *
 * The handful of `lib/projects.ts` exports that are safe to import from a
 * Client Component: plain constants/functions with no dependency on
 * `lib/auth.ts` (which pulls in `next/headers`, a server-only API). Every
 * other project helper does real request work and stays server-only.
 *
 * `lib/projects.ts` re-exports these too, so server-side callers can keep
 * importing everything from one place — only Client Components need to
 * import from here specifically, to avoid dragging server-only code (and
 * the `next/headers` build error it causes) into the browser bundle.
 *
 * @module apps/binx-web/src/lib/projects-client.ts
 * @author Binx.io
 */
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "archived"];

/** Display label for each lifecycle status — shared by the status select, badges, and summary cards. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

/**
 * getProjectFileDownloadUrl
 *
 * Builds the URL for downloading a file's bytes. Deliberately NOT a direct
 * link to binx-api — the browser has no bearer token to send there. It
 * points at this app's own `/api/projects/.../files/[fileId]` route, which
 * proxies the request server-side (see that route's handler) using the
 * session's access token, the same way every other authenticated call here does.
 *
 * @function getProjectFileDownloadUrl
 */
export function getProjectFileDownloadUrl(agencyId: string, projectId: string, fileId: string): string {
  return `/api/projects/${agencyId}/${projectId}/files/${fileId}`;
}

/**
 * getTaskFileDownloadUrl
 *
 * Same proxy-route reasoning as getProjectFileDownloadUrl above, for a file
 * attached to a specific task rather than the project as a whole.
 *
 * @function getTaskFileDownloadUrl
 */
export function getTaskFileDownloadUrl(agencyId: string, projectId: string, taskId: string, fileId: string): string {
  return `/api/projects/${agencyId}/${projectId}/tasks/${taskId}/files/${fileId}`;
}
