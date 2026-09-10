/**
 * projects.ts
 *
 * Server-only helpers for authenticated calls to binx-api's
 * `/agencies/{agencyId}/projects/*` endpoints — projects themselves, their
 * assigned team members, their kanban board (task lists + tasks), and their
 * files. Like `lib/clients.ts`, these attach the existing access token
 * rather than establishing a new session.
 *
 * @module apps/binx-web/src/lib/projects.ts
 * @author Binx.io
 */
import axios from "axios";
import { cache } from "react";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import {
  getProjectFileDownloadUrl,
  getTaskFileDownloadUrl,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "@/lib/projects-client";

// Re-exported so server-side callers can import everything from this one
// module — see lib/projects-client.ts for why these live there instead of
// being defined here directly.
export { getProjectFileDownloadUrl, getTaskFileDownloadUrl, PROJECT_STATUS_LABELS, PROJECT_STATUSES };
export type { ProjectStatus };

export interface Project {
  id: string;
  agency_id: string;
  client_id: string;
  client_name: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  member_count: number;
  created_at: string;
}

/** Fields the create/edit form submits. */
export interface ProjectDetailsInput {
  name: string;
  clientId: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  /** Custom, purely descriptive project role (e.g. "Project Manager") — see ProjectRole. Null if unassigned. */
  role_id: string | null;
  role_name: string | null;
  role_color: string | null;
}

/** A custom, per-project label for what a member does (e.g. "Project Manager", "Web Developer"). */
export interface ProjectRole {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

/** A custom, per-project label for categorizing tasks (e.g. "Bug", "Design"). */
export interface ProjectTag {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

export interface TaskList {
  id: string;
  project_id: string;
  name: string;
  position: number;
}

export interface Task {
  id: string;
  project_id: string;
  list_id: string;
  title: string;
  description: string | null;
  position: number;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  comment_count: number;
  file_count: number;
  tags: ProjectTag[];
}

/** One kanban column plus its cards, in display order — what getProjectBoard returns per column. */
export interface BoardColumn extends TaskList {
  tasks: Task[];
}

/** Fields the task create/edit form submits. */
export interface TaskDetailsInput {
  listId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  assigneeId: string | null;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by_name: string | null;
  /**
   * Set when this row is the project-level mirror of a file attached to a
   * task (binx-api's ProjectFile.source_task_file_id). The Files table badges
   * these with the task name and blocks deleting them there — they're removed
   * by detaching them from the task.
   */
  source_task_id: string | null;
  source_task_title: string | null;
  created_at: string;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

function toProjectPayload(input: ProjectDetailsInput) {
  return {
    name: input.name,
    client_id: input.clientId,
    description: input.description,
    status: input.status,
    start_date: input.startDate,
    due_date: input.dueDate,
  };
}

// ---- Projects ----

/**
 * getAgencyProjects
 *
 * Lists an agency's projects via `GET /agencies/{agencyId}/projects`, most
 * recently created first. Any member can call this. Pass `status` to filter
 * to one lifecycle stage.
 *
 * @function getAgencyProjects
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getAgencyProjects(agencyId: string, status?: ProjectStatus): Promise<Project[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<Project[]>(`/agencies/${agencyId}/projects`, {
      headers,
      params: status ? { status_filter: status } : undefined,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load projects");
  }
}

/**
 * getAgencyProject
 *
 * Fetches a single project via `GET /agencies/{agencyId}/projects/{projectId}`.
 * The project's layout and each of its dashboard/board/settings pages all
 * need this, so it's wrapped in React's `cache()` — one request's worth of
 * calls with the same (agencyId, projectId) share a single fetch, the same
 * dedup `getCurrentAgencyContext` uses in lib/agencies.ts.
 *
 * @function getAgencyProject
 * @throws {AuthApiError} - Thrown if not authenticated, or the project doesn't exist in this agency.
 */
export const getAgencyProject = cache(async (agencyId: string, projectId: string): Promise<Project> => {
  const headers = await authHeader();

  try {
    const { data } = await api.get<Project>(`/agencies/${agencyId}/projects/${projectId}`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load project");
  }
});

/**
 * createAgencyProject
 *
 * Creates a project under an agency via `POST /agencies/{agencyId}/projects`.
 * Any member can call this — starting a project is day-to-day work, not
 * agency administration. binx-api seeds the default kanban columns.
 *
 * @function createAgencyProject
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function createAgencyProject(agencyId: string, input: ProjectDetailsInput): Promise<Project> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<Project>(`/agencies/${agencyId}/projects`, toProjectPayload(input), { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create project");
  }
}

/**
 * updateAgencyProject
 *
 * Replaces a project's details via `PATCH /agencies/{agencyId}/projects/{projectId}`.
 * A full replace, not a partial patch — the edit form always submits every field together.
 *
 * @function updateAgencyProject
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function updateAgencyProject(
  agencyId: string,
  projectId: string,
  input: ProjectDetailsInput,
): Promise<Project> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<Project>(
      `/agencies/${agencyId}/projects/${projectId}`,
      toProjectPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update project");
  }
}

/**
 * deleteAgencyProject
 *
 * Permanently deletes a project via `DELETE /agencies/{agencyId}/projects/{projectId}`.
 * binx-api requires the caller to be an owner or admin of this agency, same
 * split as deleting a client or the agency itself.
 *
 * @function deleteAgencyProject
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller lacks permission for this agency.
 */
export async function deleteAgencyProject(agencyId: string, projectId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete project");
  }
}

// ---- Members ----

/**
 * getProjectMembers
 *
 * Lists who's assigned to a project via
 * `GET /agencies/{agencyId}/projects/{projectId}/members`.
 *
 * @function getProjectMembers
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getProjectMembers(agencyId: string, projectId: string): Promise<ProjectMember[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<ProjectMember[]>(`/agencies/${agencyId}/projects/${projectId}/members`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load project members");
  }
}

/**
 * addProjectMember
 *
 * Assigns an agency member to a project via
 * `POST /agencies/{agencyId}/projects/{projectId}/members`. binx-api rejects
 * anyone who isn't already a member of the project's agency.
 *
 * @function addProjectMember
 * @throws {AuthApiError} - Thrown if not authenticated, not an agency member, or already assigned.
 */
export async function addProjectMember(agencyId: string, projectId: string, userId: string): Promise<ProjectMember> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ProjectMember>(
      `/agencies/${agencyId}/projects/${projectId}/members`,
      { user_id: userId },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to assign this person to the project");
  }
}

/**
 * removeProjectMember
 *
 * Unassigns someone from a project via
 * `DELETE /agencies/{agencyId}/projects/{projectId}/members/{memberId}`.
 *
 * @function removeProjectMember
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function removeProjectMember(agencyId: string, projectId: string, memberId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/members/${memberId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to remove this person from the project");
  }
}

// ---- Kanban board ----

/**
 * getProjectBoard
 *
 * Fetches every column and card for a project's kanban board in one call via
 * `GET /agencies/{agencyId}/projects/{projectId}/board`, already in display order.
 *
 * @function getProjectBoard
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getProjectBoard(agencyId: string, projectId: string): Promise<BoardColumn[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<BoardColumn[]>(`/agencies/${agencyId}/projects/${projectId}/board`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the board");
  }
}

/**
 * createTaskList
 *
 * Adds a new column at the right-hand end of the board via
 * `POST /agencies/{agencyId}/projects/{projectId}/task-lists`.
 *
 * @function createTaskList
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function createTaskList(agencyId: string, projectId: string, name: string): Promise<TaskList> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<TaskList>(
      `/agencies/${agencyId}/projects/${projectId}/task-lists`,
      { name },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create list");
  }
}

/**
 * renameTaskList
 *
 * Renames a column via `PATCH /agencies/{agencyId}/projects/{projectId}/task-lists/{listId}`.
 *
 * @function renameTaskList
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function renameTaskList(
  agencyId: string,
  projectId: string,
  listId: string,
  name: string,
): Promise<TaskList> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<TaskList>(
      `/agencies/${agencyId}/projects/${projectId}/task-lists/${listId}`,
      { name },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to rename list");
  }
}

/**
 * deleteTaskList
 *
 * Removes an empty column via `DELETE /agencies/{agencyId}/projects/{projectId}/task-lists/{listId}`.
 * binx-api rejects this if the column still has cards, or if it's the
 * board's only remaining column.
 *
 * @function deleteTaskList
 * @throws {AuthApiError} - Thrown if not authenticated, the column isn't empty, or it's the last one.
 */
export async function deleteTaskList(agencyId: string, projectId: string, listId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/task-lists/${listId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete list");
  }
}

function toTaskPayload(input: TaskDetailsInput) {
  return {
    list_id: input.listId,
    title: input.title,
    description: input.description,
    due_date: input.dueDate,
    assignee_id: input.assigneeId,
  };
}

/**
 * createTask
 *
 * Adds a card to the bottom of a column via
 * `POST /agencies/{agencyId}/projects/{projectId}/tasks`.
 *
 * @function createTask
 * @throws {AuthApiError} - Thrown if not authenticated, or the assignee isn't an agency member.
 */
export async function createTask(agencyId: string, projectId: string, input: TaskDetailsInput): Promise<Task> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<Task>(
      `/agencies/${agencyId}/projects/${projectId}/tasks`,
      toTaskPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create task");
  }
}

/**
 * updateTask
 *
 * Replaces a card's content via `PATCH /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}`.
 * A full replace, including which list it's in — see moveTask for a
 * lighter-weight drag/quick-move that only changes list + position.
 *
 * @function updateTask
 * @throws {AuthApiError} - Thrown if not authenticated, or the assignee isn't an agency member.
 */
export async function updateTask(
  agencyId: string,
  projectId: string,
  taskId: string,
  input: TaskDetailsInput,
): Promise<Task> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<Task>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}`,
      toTaskPayload(input),
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update task");
  }
}

/**
 * moveTask
 *
 * Moves a card to a specific list + position via
 * `PATCH /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/move` — what
 * the board's "Move to" control does. binx-api reindexes both the
 * destination and (if it changed) source list to stay contiguous.
 *
 * @function moveTask
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function moveTask(
  agencyId: string,
  projectId: string,
  taskId: string,
  listId: string,
  position: number,
): Promise<Task> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<Task>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/move`,
      { list_id: listId, position },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to move task");
  }
}

/**
 * deleteTask
 *
 * Removes a card via `DELETE /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}`.
 *
 * @function deleteTask
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteTask(agencyId: string, projectId: string, taskId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete task");
  }
}

// ---- Files ----

/**
 * getProjectFiles
 *
 * Lists a project's files via `GET /agencies/{agencyId}/projects/{projectId}/files`,
 * newest first.
 *
 * @function getProjectFiles
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getProjectFiles(agencyId: string, projectId: string): Promise<ProjectFile[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<ProjectFile[]>(`/agencies/${agencyId}/projects/${projectId}/files`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load files");
  }
}

/**
 * uploadProjectFile
 *
 * Uploads a file via `POST /agencies/{agencyId}/projects/{projectId}/files`
 * (multipart/form-data). binx-api stores the bytes on local disk and rejects
 * anything over its per-file size cap.
 *
 * @function uploadProjectFile
 * @throws {AuthApiError} - Thrown if not authenticated, or the file is too large.
 */
export async function uploadProjectFile(agencyId: string, projectId: string, file: File): Promise<ProjectFile> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);

  try {
    // `api`'s instance-level default sets Content-Type: application/json
    // (see lib/api.ts) — a per-request `headers` object merges on TOP of
    // that default rather than replacing it, so without this override axios
    // never triggers its "body is FormData" detection and instead
    // JSON.stringifies the FormData into `{}`, silently mangling the upload.
    // Explicit `undefined` here deletes the inherited header so axios sets
    // its own `multipart/form-data; boundary=...` — required, since the
    // boundary can't be set by hand.
    const { data } = await api.post<ProjectFile>(`/agencies/${agencyId}/projects/${projectId}/files`, formData, {
      headers: { ...headers, "Content-Type": undefined },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to upload file");
  }
}

/**
 * deleteProjectFile
 *
 * Removes a file (record and bytes) via
 * `DELETE /agencies/{agencyId}/projects/{projectId}/files/{fileId}`.
 *
 * @function deleteProjectFile
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteProjectFile(agencyId: string, projectId: string, fileId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/files/${fileId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete file");
  }
}

// ---- Task comments ----
// Every commenter today is an agency member — binx-api has no client-facing
// portal yet. author_type is already shaped for that ("agency_member" now,
// "client" reserved), so the UI (and this layer) doesn't need to change
// shape when that lands; see AUTHOR_CLIENT in binx-api's projects/models.py.

export interface TaskComment {
  id: string;
  task_id: string;
  author_type: "agency_member" | "client";
  author_user_id: string | null;
  author_name: string;
  body: string;
  /**
   * The one file the comment carries, or null. binx-api stores it as an
   * ordinary task file, so it also appears on the task's Files tab and in the
   * project-wide Files list, and downloads through the task-file route
   * (`getTaskFileDownloadUrl`).
   */
  attachment: TaskFile | null;
  created_at: string;
}

/**
 * getTaskComments
 *
 * Lists a task's comments, oldest first, via
 * `GET /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/comments`.
 *
 * @function getTaskComments
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getTaskComments(agencyId: string, projectId: string, taskId: string): Promise<TaskComment[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<TaskComment[]>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/comments`,
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load comments");
  }
}

/**
 * addTaskComment
 *
 * Posts a comment as the signed-in user via
 * `POST /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/comments`.
 * Sent as multipart/form-data — a comment can carry one optional file, which
 * binx-api restricts to images/PDF/Word (same rule as task files).
 *
 * @function addTaskComment
 * @throws {AuthApiError} - Thrown if not authenticated, the file type isn't allowed, or it's too large.
 */
export async function addTaskComment(
  agencyId: string,
  projectId: string,
  taskId: string,
  body: string,
  file?: File | null,
): Promise<TaskComment> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("body", body);
  if (file) {
    formData.append("file", file);
  }

  try {
    // See uploadProjectFile's comment: the inherited `Content-Type:
    // application/json` default has to be deleted so axios detects the
    // FormData body and sets its own multipart boundary.
    const { data } = await api.post<TaskComment>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/comments`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to post comment");
  }
}

/**
 * deleteTaskComment
 *
 * Removes a comment via
 * `DELETE /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/comments/{commentId}`.
 * binx-api only allows this for the comment's own author, or an owner/admin.
 *
 * @function deleteTaskComment
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller may not delete this comment.
 */
export async function deleteTaskComment(
  agencyId: string,
  projectId: string,
  taskId: string,
  commentId: string,
): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete comment");
  }
}

// ---- Task files ----
// Restricted to images/PDF/Word — see ALLOWED_TASK_FILE_MIME_TYPES in
// binx-api's projects/service.py — unlike project-level files, which accept
// anything.

export interface TaskFile {
  id: string;
  task_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by_name: string | null;
  created_at: string;
}

/**
 * getTaskFiles
 *
 * Lists a task's attached files, newest first, via
 * `GET /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/files`.
 *
 * @function getTaskFiles
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getTaskFiles(agencyId: string, projectId: string, taskId: string): Promise<TaskFile[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<TaskFile[]>(`/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/files`, {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load files");
  }
}

/**
 * uploadTaskFile
 *
 * Attaches a file to a task via
 * `POST /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/files`
 * (multipart/form-data). binx-api rejects anything that isn't an image,
 * PDF, or Word document, and anything over its per-file size cap.
 *
 * @function uploadTaskFile
 * @throws {AuthApiError} - Thrown if not authenticated, the file type isn't allowed, or it's too large.
 */
export async function uploadTaskFile(agencyId: string, projectId: string, taskId: string, file: File): Promise<TaskFile> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);

  try {
    // See the matching comment in uploadProjectFile above — without deleting
    // the inherited Content-Type: application/json default, axios never
    // detects the FormData body and mangles it instead of sending multipart.
    const { data } = await api.post<TaskFile>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/files`,
      formData,
      { headers: { ...headers, "Content-Type": undefined } },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to upload file");
  }
}

/**
 * deleteTaskFile
 *
 * Removes a task file (record and bytes) via
 * `DELETE /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/files/{fileId}`.
 *
 * @function deleteTaskFile
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteTaskFile(agencyId: string, projectId: string, taskId: string, fileId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/files/${fileId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete file");
  }
}

// ---- Member roles ----
// Assigns (or clears) a member's custom, purely descriptive project role —
// distinct from their agency-level owner/admin/member role.

/**
 * assignProjectMemberRole
 *
 * Sets a member's custom role via `PATCH /agencies/{agencyId}/projects/{projectId}/members/{memberId}`.
 * Pass `roleId: null` to clear it.
 *
 * @function assignProjectMemberRole
 * @throws {AuthApiError} - Thrown if not authenticated, or the role belongs to a different project.
 */
export async function assignProjectMemberRole(
  agencyId: string,
  projectId: string,
  memberId: string,
  roleId: string | null,
): Promise<ProjectMember> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<ProjectMember>(
      `/agencies/${agencyId}/projects/${projectId}/members/${memberId}`,
      { role_id: roleId },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update this person's role");
  }
}

// ---- Roles ----
// Custom, purely descriptive per-project labels (e.g. "Project Manager"),
// configured in Settings and assigned to members on the Team tab.

/**
 * getProjectRoles
 *
 * Lists a project's custom roles, alphabetically, via
 * `GET /agencies/{agencyId}/projects/{projectId}/roles`.
 *
 * @function getProjectRoles
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getProjectRoles(agencyId: string, projectId: string): Promise<ProjectRole[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<ProjectRole[]>(`/agencies/${agencyId}/projects/${projectId}/roles`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load roles");
  }
}

/**
 * createProjectRole
 *
 * Adds a new role via `POST /agencies/{agencyId}/projects/{projectId}/roles`.
 *
 * @function createProjectRole
 * @throws {AuthApiError} - Thrown if not authenticated, or a role with this name already exists.
 */
export async function createProjectRole(
  agencyId: string,
  projectId: string,
  name: string,
  color: string,
): Promise<ProjectRole> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ProjectRole>(
      `/agencies/${agencyId}/projects/${projectId}/roles`,
      { name, color },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create role");
  }
}

/**
 * updateProjectRole
 *
 * Renames/recolors a role via `PATCH /agencies/{agencyId}/projects/{projectId}/roles/{roleId}`.
 *
 * @function updateProjectRole
 * @throws {AuthApiError} - Thrown if not authenticated, or a role with this name already exists.
 */
export async function updateProjectRole(
  agencyId: string,
  projectId: string,
  roleId: string,
  name: string,
  color: string,
): Promise<ProjectRole> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<ProjectRole>(
      `/agencies/${agencyId}/projects/${projectId}/roles/${roleId}`,
      { name, color },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update role");
  }
}

/**
 * deleteProjectRole
 *
 * Removes a role via `DELETE /agencies/{agencyId}/projects/{projectId}/roles/{roleId}`.
 * binx-api clears the role from any member who had it — it doesn't unassign them.
 *
 * @function deleteProjectRole
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteProjectRole(agencyId: string, projectId: string, roleId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/roles/${roleId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete role");
  }
}

// ---- Tags ----
// Same shape as Roles above, for categorizing tasks (e.g. "Bug", "Design").

/**
 * getProjectTags
 *
 * Lists a project's custom tags, alphabetically, via
 * `GET /agencies/{agencyId}/projects/{projectId}/tags`.
 *
 * @function getProjectTags
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getProjectTags(agencyId: string, projectId: string): Promise<ProjectTag[]> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<ProjectTag[]>(`/agencies/${agencyId}/projects/${projectId}/tags`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load tags");
  }
}

/**
 * createProjectTag
 *
 * Adds a new tag via `POST /agencies/{agencyId}/projects/{projectId}/tags`.
 *
 * @function createProjectTag
 * @throws {AuthApiError} - Thrown if not authenticated, or a tag with this name already exists.
 */
export async function createProjectTag(
  agencyId: string,
  projectId: string,
  name: string,
  color: string,
): Promise<ProjectTag> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ProjectTag>(
      `/agencies/${agencyId}/projects/${projectId}/tags`,
      { name, color },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to create tag");
  }
}

/**
 * updateProjectTag
 *
 * Renames/recolors a tag via `PATCH /agencies/{agencyId}/projects/{projectId}/tags/{tagId}`.
 *
 * @function updateProjectTag
 * @throws {AuthApiError} - Thrown if not authenticated, or a tag with this name already exists.
 */
export async function updateProjectTag(
  agencyId: string,
  projectId: string,
  tagId: string,
  name: string,
  color: string,
): Promise<ProjectTag> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<ProjectTag>(
      `/agencies/${agencyId}/projects/${projectId}/tags/${tagId}`,
      { name, color },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update tag");
  }
}

/**
 * deleteProjectTag
 *
 * Removes a tag via `DELETE /agencies/{agencyId}/projects/{projectId}/tags/{tagId}`.
 * binx-api removes it from every task that had it — no orphaned reference is left behind.
 *
 * @function deleteProjectTag
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function deleteProjectTag(agencyId: string, projectId: string, tagId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/agencies/${agencyId}/projects/${projectId}/tags/${tagId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to delete tag");
  }
}

/**
 * setTaskTags
 *
 * Replaces a task's tags via `PUT /agencies/{agencyId}/projects/{projectId}/tasks/{taskId}/tags`.
 * A full replace — the tag picker always submits the complete set.
 *
 * @function setTaskTags
 * @throws {AuthApiError} - Thrown if not authenticated, or a tag_id belongs to a different project.
 */
export async function setTaskTags(
  agencyId: string,
  projectId: string,
  taskId: string,
  tagIds: string[],
): Promise<Task> {
  const headers = await authHeader();

  try {
    const { data } = await api.put<Task>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/tags`,
      { tag_ids: tagIds },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update tags");
  }
}
