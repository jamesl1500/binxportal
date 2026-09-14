/**
 * actions.ts - Project Dashboard
 *
 * Server actions for a single project's dashboard: the project itself, who's
 * assigned to it, its kanban board (lists + tasks), and its files. All are
 * plain authenticated mutations — no session cookies change — so they call
 * binx-api directly via `lib/projects.ts` rather than going through an
 * internal `/api/*` proxy route (file downloads are the one exception; see
 * app/api/projects/.../route.ts).
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { applyProjectTaskSuggestions, generateProjectSummary, suggestProjectTasks } from "@/lib/ai";
import type { AiTaskSuggestions } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import {
  addProjectMember,
  addTaskComment,
  assignProjectMemberRole,
  BoardColumn,
  createProjectRole,
  createProjectTag,
  createTask,
  createTaskList,
  deleteAgencyProject,
  deleteProjectFile,
  deleteProjectRole,
  deleteProjectTag,
  deleteTask,
  deleteTaskComment,
  deleteTaskFile,
  deleteTaskList,
  getProjectRoles,
  getProjectTags,
  getTaskComments,
  getTaskFiles,
  moveTask,
  moveTaskList,
  Project,
  ProjectDetailsInput,
  ProjectFile,
  ProjectMember,
  ProjectRole,
  ProjectTag,
  removeProjectMember,
  renameTaskList,
  setTaskTags,
  Task,
  TaskComment,
  TaskDetailsInput,
  TaskFile,
  TaskList,
  updateAgencyProject,
  updateProjectRole,
  updateProjectTag,
  updateTask,
  uploadProjectFile,
  uploadTaskFile,
} from "@/lib/projects";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

// ---- Project ----

export interface UpdateProjectActionResult {
  error?: string;
  project?: Project;
}

export async function updateProjectAction(
  agencyId: string,
  projectId: string,
  input: ProjectDetailsInput,
): Promise<UpdateProjectActionResult> {
  try {
    const project = await updateAgencyProject(agencyId, projectId, input);
    return { project };
  } catch (error) {
    return errorResult(error, "Unable to update project");
  }
}

export interface DeleteProjectActionResult {
  error?: string;
}

export async function deleteProjectAction(agencyId: string, projectId: string): Promise<DeleteProjectActionResult> {
  try {
    await deleteAgencyProject(agencyId, projectId);
  } catch (error) {
    return errorResult(error, "Unable to delete project");
  }

  redirect("/projects");
}

// ---- Members ----

export interface AddProjectMemberActionResult {
  error?: string;
  member?: ProjectMember;
}

export async function addProjectMemberAction(
  agencyId: string,
  projectId: string,
  userId: string,
): Promise<AddProjectMemberActionResult> {
  try {
    const member = await addProjectMember(agencyId, projectId, userId);
    return { member };
  } catch (error) {
    return errorResult(error, "Unable to assign this person to the project");
  }
}

export interface RemoveProjectMemberActionResult {
  error?: string;
}

export async function removeProjectMemberAction(
  agencyId: string,
  projectId: string,
  memberId: string,
): Promise<RemoveProjectMemberActionResult> {
  try {
    await removeProjectMember(agencyId, projectId, memberId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to remove this person from the project");
  }
}

// ---- Kanban: lists ----

export interface TaskListActionResult {
  error?: string;
  list?: TaskList;
}

export async function createTaskListAction(
  agencyId: string,
  projectId: string,
  name: string,
): Promise<TaskListActionResult> {
  try {
    const list = await createTaskList(agencyId, projectId, name);
    return { list };
  } catch (error) {
    return errorResult(error, "Unable to create list");
  }
}

export async function renameTaskListAction(
  agencyId: string,
  projectId: string,
  listId: string,
  name: string,
): Promise<TaskListActionResult> {
  try {
    const list = await renameTaskList(agencyId, projectId, listId, name);
    return { list };
  } catch (error) {
    return errorResult(error, "Unable to rename list");
  }
}

export interface DeleteTaskListActionResult {
  error?: string;
}

export async function deleteTaskListAction(
  agencyId: string,
  projectId: string,
  listId: string,
): Promise<DeleteTaskListActionResult> {
  try {
    await deleteTaskList(agencyId, projectId, listId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete list");
  }
}

export async function moveTaskListAction(
  agencyId: string,
  projectId: string,
  listId: string,
  position: number,
): Promise<TaskListActionResult> {
  try {
    const list = await moveTaskList(agencyId, projectId, listId, position);
    return { list };
  } catch (error) {
    return errorResult(error, "Unable to move list");
  }
}

// ---- Kanban: tasks ----

export interface TaskActionResult {
  error?: string;
  task?: Task;
}

export async function createTaskAction(
  agencyId: string,
  projectId: string,
  input: TaskDetailsInput,
): Promise<TaskActionResult> {
  try {
    const task = await createTask(agencyId, projectId, input);
    return { task };
  } catch (error) {
    return errorResult(error, "Unable to create task");
  }
}

export async function updateTaskAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  input: TaskDetailsInput,
): Promise<TaskActionResult> {
  try {
    const task = await updateTask(agencyId, projectId, taskId, input);
    return { task };
  } catch (error) {
    return errorResult(error, "Unable to update task");
  }
}

export async function moveTaskAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  listId: string,
  position: number,
): Promise<TaskActionResult> {
  try {
    const task = await moveTask(agencyId, projectId, taskId, listId, position);
    return { task };
  } catch (error) {
    return errorResult(error, "Unable to move task");
  }
}

export interface DeleteTaskActionResult {
  error?: string;
}

export async function deleteTaskAction(
  agencyId: string,
  projectId: string,
  taskId: string,
): Promise<DeleteTaskActionResult> {
  try {
    await deleteTask(agencyId, projectId, taskId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete task");
  }
}

export type { BoardColumn };

// ---- Files ----

export interface UploadProjectFileActionResult {
  error?: string;
  file?: ProjectFile;
}

export async function uploadProjectFileAction(
  agencyId: string,
  projectId: string,
  file: File,
): Promise<UploadProjectFileActionResult> {
  try {
    const uploaded = await uploadProjectFile(agencyId, projectId, file);
    return { file: uploaded };
  } catch (error) {
    return errorResult(error, "Unable to upload file");
  }
}

export interface DeleteProjectFileActionResult {
  error?: string;
}

export async function deleteProjectFileAction(
  agencyId: string,
  projectId: string,
  fileId: string,
): Promise<DeleteProjectFileActionResult> {
  try {
    await deleteProjectFile(agencyId, projectId, fileId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete file");
  }
}

// ---- Task comments ----
// Comments/files aren't fetched for every task up front (that would mean an
// N+1 fetch per board load for panels most of which never open) — the panel
// calls these "get" actions itself, once, when it opens.

export interface GetTaskCommentsActionResult {
  error?: string;
  comments?: TaskComment[];
}

export async function getTaskCommentsAction(
  agencyId: string,
  projectId: string,
  taskId: string,
): Promise<GetTaskCommentsActionResult> {
  try {
    const comments = await getTaskComments(agencyId, projectId, taskId);
    return { comments };
  } catch (error) {
    return errorResult(error, "Unable to load comments");
  }
}

export interface AddTaskCommentActionResult {
  error?: string;
  comment?: TaskComment;
}

export async function addTaskCommentAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  body: string,
  file?: File | null,
): Promise<AddTaskCommentActionResult> {
  try {
    const comment = await addTaskComment(agencyId, projectId, taskId, body, file);
    return { comment };
  } catch (error) {
    return errorResult(error, "Unable to post comment");
  }
}

export interface DeleteTaskCommentActionResult {
  error?: string;
}

export async function deleteTaskCommentAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  commentId: string,
): Promise<DeleteTaskCommentActionResult> {
  try {
    await deleteTaskComment(agencyId, projectId, taskId, commentId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete comment");
  }
}

// ---- Task files ----

export interface GetTaskFilesActionResult {
  error?: string;
  files?: TaskFile[];
}

export async function getTaskFilesAction(
  agencyId: string,
  projectId: string,
  taskId: string,
): Promise<GetTaskFilesActionResult> {
  try {
    const files = await getTaskFiles(agencyId, projectId, taskId);
    return { files };
  } catch (error) {
    return errorResult(error, "Unable to load files");
  }
}

export interface UploadTaskFileActionResult {
  error?: string;
  file?: TaskFile;
}

export async function uploadTaskFileAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  file: File,
): Promise<UploadTaskFileActionResult> {
  try {
    const uploaded = await uploadTaskFile(agencyId, projectId, taskId, file);
    return { file: uploaded };
  } catch (error) {
    return errorResult(error, "Unable to upload file");
  }
}

export interface DeleteTaskFileActionResult {
  error?: string;
}

export async function deleteTaskFileAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  fileId: string,
): Promise<DeleteTaskFileActionResult> {
  try {
    await deleteTaskFile(agencyId, projectId, taskId, fileId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete file");
  }
}

// ---- Member roles ----

export interface AssignProjectMemberRoleActionResult {
  error?: string;
  member?: ProjectMember;
}

export async function assignProjectMemberRoleAction(
  agencyId: string,
  projectId: string,
  memberId: string,
  roleId: string | null,
): Promise<AssignProjectMemberRoleActionResult> {
  try {
    const member = await assignProjectMemberRole(agencyId, projectId, memberId, roleId);
    return { member };
  } catch (error) {
    return errorResult(error, "Unable to update this person's role");
  }
}

// ---- Roles ----

export interface GetProjectRolesActionResult {
  error?: string;
  roles?: ProjectRole[];
}

export async function getProjectRolesAction(agencyId: string, projectId: string): Promise<GetProjectRolesActionResult> {
  try {
    const roles = await getProjectRoles(agencyId, projectId);
    return { roles };
  } catch (error) {
    return errorResult(error, "Unable to load roles");
  }
}

export interface ProjectRoleActionResult {
  error?: string;
  role?: ProjectRole;
}

export async function createProjectRoleAction(
  agencyId: string,
  projectId: string,
  name: string,
  color: string,
): Promise<ProjectRoleActionResult> {
  try {
    const role = await createProjectRole(agencyId, projectId, name, color);
    return { role };
  } catch (error) {
    return errorResult(error, "Unable to create role");
  }
}

export async function updateProjectRoleAction(
  agencyId: string,
  projectId: string,
  roleId: string,
  name: string,
  color: string,
): Promise<ProjectRoleActionResult> {
  try {
    const role = await updateProjectRole(agencyId, projectId, roleId, name, color);
    return { role };
  } catch (error) {
    return errorResult(error, "Unable to update role");
  }
}

export interface DeleteProjectRoleActionResult {
  error?: string;
}

export async function deleteProjectRoleAction(
  agencyId: string,
  projectId: string,
  roleId: string,
): Promise<DeleteProjectRoleActionResult> {
  try {
    await deleteProjectRole(agencyId, projectId, roleId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete role");
  }
}

// ---- Tags ----

export interface GetProjectTagsActionResult {
  error?: string;
  tags?: ProjectTag[];
}

export async function getProjectTagsAction(agencyId: string, projectId: string): Promise<GetProjectTagsActionResult> {
  try {
    const tags = await getProjectTags(agencyId, projectId);
    return { tags };
  } catch (error) {
    return errorResult(error, "Unable to load tags");
  }
}

export interface ProjectTagActionResult {
  error?: string;
  tag?: ProjectTag;
}

export async function createProjectTagAction(
  agencyId: string,
  projectId: string,
  name: string,
  color: string,
): Promise<ProjectTagActionResult> {
  try {
    const tag = await createProjectTag(agencyId, projectId, name, color);
    return { tag };
  } catch (error) {
    return errorResult(error, "Unable to create tag");
  }
}

export async function updateProjectTagAction(
  agencyId: string,
  projectId: string,
  tagId: string,
  name: string,
  color: string,
): Promise<ProjectTagActionResult> {
  try {
    const tag = await updateProjectTag(agencyId, projectId, tagId, name, color);
    return { tag };
  } catch (error) {
    return errorResult(error, "Unable to update tag");
  }
}

export interface DeleteProjectTagActionResult {
  error?: string;
}

export async function deleteProjectTagAction(
  agencyId: string,
  projectId: string,
  tagId: string,
): Promise<DeleteProjectTagActionResult> {
  try {
    await deleteProjectTag(agencyId, projectId, tagId);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to delete tag");
  }
}

export interface SetTaskTagsActionResult {
  error?: string;
  task?: Task;
}

export async function setTaskTagsAction(
  agencyId: string,
  projectId: string,
  taskId: string,
  tagIds: string[],
): Promise<SetTaskTagsActionResult> {
  try {
    const task = await setTaskTags(agencyId, projectId, taskId, tagIds);
    return { task };
  } catch (error) {
    return errorResult(error, "Unable to update tags");
  }
}

// ---- AI ----

export interface AiProjectSummaryActionResult {
  error?: string;
  draft?: string;
}

export async function generateProjectSummaryAction(
  agencyId: string,
  projectId: string,
): Promise<AiProjectSummaryActionResult> {
  try {
    return { draft: await generateProjectSummary(agencyId, projectId) };
  } catch (error) {
    return errorResult(error, "Unable to draft a summary");
  }
}

export interface AiTaskSuggestionsActionResult {
  error?: string;
  suggestions?: AiTaskSuggestions;
}

export async function suggestProjectTasksAction(
  agencyId: string,
  projectId: string,
): Promise<AiTaskSuggestionsActionResult> {
  try {
    return { suggestions: await suggestProjectTasks(agencyId, projectId) };
  } catch (error) {
    return errorResult(error, "Unable to suggest a starter task list");
  }
}

export async function applyProjectTaskSuggestionsAction(
  agencyId: string,
  projectId: string,
  suggestions: AiTaskSuggestions,
): Promise<{ error?: string }> {
  try {
    await applyProjectTaskSuggestions(agencyId, projectId, suggestions);
    return {};
  } catch (error) {
    return errorResult(error, "Unable to set up the task list");
  }
}
