/**
 * actions.ts - Project canvas (staff)
 *
 * Server actions for the project collaboration canvas. Thin wrappers over
 * `lib/boards.ts` — binx-api broadcasts every change over the websocket, so
 * these never call `router.refresh()`; the store reconciles from the event.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/canvas/actions.ts
 * @author Binx Portal
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import type {
  BoardComment,
  BoardItem,
  BoardItemPatch,
  BoardItemVersion,
  BoardTask,
  BoardTaskPatch,
} from "@/lib/boards-client";
import { getProjectBoard, getProjectMembers } from "@/lib/projects";
import {
  type BoardReactions,
  type CreateBoardItemInput,
  type UploadPlacement,
  addBoardComment,
  addBoardTask,
  attachBoardTask,
  removeBoardTask,
  updateBoardTask,
  uploadBoardFile,
  createBoardItem,
  deleteBoardComment,
  deleteBoardItem,
  getBoard,
  getBoardComments,
  getBoardItemVersions,
  requestBoardApproval,
  toggleBoardReaction,
  updateBoardItem,
  uploadBoardImage,
  withdrawBoardApproval,
} from "@/lib/boards";

function fail(error: unknown, fallback: string): { error: string } {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function createBoardItemAction(
  agencyId: string,
  projectId: string,
  input: CreateBoardItemInput,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await createBoardItem(agencyId, projectId, input) };
  } catch (error) {
    return fail(error, "Unable to add the card");
  }
}

export async function updateBoardItemAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  patch: BoardItemPatch,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await updateBoardItem(agencyId, projectId, itemId, patch) };
  } catch (error) {
    return fail(error, "Unable to update the card");
  }
}

export async function deleteBoardItemAction(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<{ error?: string }> {
  try {
    await deleteBoardItem(agencyId, projectId, itemId);
    return {};
  } catch (error) {
    return fail(error, "Unable to delete the card");
  }
}

/** Reads the shared upload form (file + placement) that both the image and
 * file card uploads post. */
function readUpload(
  formData: FormData,
): { file: File; placement: UploadPlacement } | null {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const num = (key: string) => Number(formData.get(key) ?? 0);
  const str = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value ? value : undefined;
  };
  return {
    file,
    placement: {
      x: num("x"),
      y: num("y"),
      width: num("width") || undefined,
      height: num("height") || undefined,
      board_id: str("board_id"),
      parent_id: str("parent_id"),
    },
  };
}

export async function uploadBoardImageAction(
  agencyId: string,
  projectId: string,
  formData: FormData,
): Promise<{ item?: BoardItem; error?: string }> {
  const upload = readUpload(formData);
  if (!upload) return { error: "No image selected" };
  try {
    return {
      item: await uploadBoardImage(
        agencyId,
        projectId,
        upload.file,
        upload.placement,
      ),
    };
  } catch (error) {
    return fail(error, "Unable to upload the image");
  }
}

export async function uploadBoardFileAction(
  agencyId: string,
  projectId: string,
  formData: FormData,
): Promise<{ item?: BoardItem; error?: string }> {
  const upload = readUpload(formData);
  if (!upload) return { error: "No file selected" };
  try {
    return {
      item: await uploadBoardFile(
        agencyId,
        projectId,
        upload.file,
        upload.placement,
      ),
    };
  } catch (error) {
    return fail(error, "Unable to upload the file");
  }
}

export async function resyncBoardAction(
  agencyId: string,
  projectId: string,
  boardId?: string,
): Promise<{ items?: BoardItem[]; tasks?: BoardTask[]; error?: string }> {
  try {
    const board = await getBoard(agencyId, projectId, boardId);
    return { items: board.items, tasks: board.tasks };
  } catch (error) {
    return fail(error, "Unable to reload the canvas");
  }
}

export async function toggleReactionAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  kind: string,
): Promise<{ result?: BoardReactions; error?: string }> {
  try {
    return {
      result: await toggleBoardReaction(agencyId, projectId, itemId, kind),
    };
  } catch (error) {
    return fail(error, "Unable to react");
  }
}

export async function listCommentsAction(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<{ comments?: BoardComment[]; error?: string }> {
  try {
    return { comments: await getBoardComments(agencyId, projectId, itemId) };
  } catch (error) {
    return fail(error, "Unable to load comments");
  }
}

export async function addCommentAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  body: string,
): Promise<{ comment?: BoardComment; error?: string }> {
  try {
    return {
      comment: await addBoardComment(agencyId, projectId, itemId, body),
    };
  } catch (error) {
    return fail(error, "Unable to add the comment");
  }
}

export async function deleteCommentAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  commentId: string,
): Promise<{ error?: string }> {
  try {
    await deleteBoardComment(agencyId, projectId, itemId, commentId);
    return {};
  } catch (error) {
    return fail(error, "Unable to delete the comment");
  }
}

export async function requestApprovalAction(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await requestBoardApproval(agencyId, projectId, itemId) };
  } catch (error) {
    return fail(error, "Unable to request approval");
  }
}

export async function withdrawApprovalAction(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await withdrawBoardApproval(agencyId, projectId, itemId) };
  } catch (error) {
    return fail(error, "Unable to withdraw the approval request");
  }
}

export async function listVersionsAction(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<{ versions?: BoardItemVersion[]; error?: string }> {
  try {
    return { versions: await getBoardItemVersions(agencyId, projectId, itemId) };
  } catch (error) {
    return fail(error, "Unable to load the version history");
  }
}

// ---- To-do cards ----

export async function addTaskAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  title: string,
): Promise<{ task?: BoardTask; error?: string }> {
  try {
    return { task: await addBoardTask(agencyId, projectId, itemId, title) };
  } catch (error) {
    return fail(error, "Unable to add the task");
  }
}

export async function attachTaskAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  taskId: string,
): Promise<{ task?: BoardTask; error?: string }> {
  try {
    return {
      task: await attachBoardTask(agencyId, projectId, itemId, taskId),
    };
  } catch (error) {
    return fail(error, "Unable to add that task");
  }
}

export async function updateTaskAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  taskId: string,
  patch: BoardTaskPatch,
): Promise<{ task?: BoardTask; error?: string }> {
  try {
    return {
      task: await updateBoardTask(agencyId, projectId, itemId, taskId, patch),
    };
  } catch (error) {
    return fail(error, "Unable to update the task");
  }
}

export async function removeTaskAction(
  agencyId: string,
  projectId: string,
  itemId: string,
  taskId: string,
  deleteTask: boolean,
): Promise<{ error?: string }> {
  try {
    await removeBoardTask(agencyId, projectId, itemId, taskId, deleteTask);
    return {};
  } catch (error) {
    return fail(error, "Unable to remove the task");
  }
}

/** What a to-do card's pickers offer: the project's existing tasks (to pull
 * one onto the card) and its team (to assign a row). Loaded on demand. */
export async function todoOptionsAction(
  agencyId: string,
  projectId: string,
): Promise<{
  tasks?: { id: string; title: string; list_name: string }[];
  members?: { user_id: string; full_name: string }[];
  error?: string;
}> {
  try {
    const [columns, members] = await Promise.all([
      getProjectBoard(agencyId, projectId),
      getProjectMembers(agencyId, projectId),
    ]);
    return {
      tasks: columns.flatMap((column) =>
        column.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          list_name: column.name,
        })),
      ),
      members: members.map((m) => ({ user_id: m.user_id, full_name: m.full_name })),
    };
  } catch (error) {
    return fail(error, "Unable to load the project's tasks");
  }
}
