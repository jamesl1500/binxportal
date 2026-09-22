/**
 * actions.ts - Project canvas (staff)
 *
 * Server actions for the project collaboration canvas. Thin wrappers over
 * `lib/boards.ts` — binx-api broadcasts every change over the websocket, so
 * these never call `router.refresh()`; the store reconciles from the event.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/canvas/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import type { BoardComment, BoardItem, BoardItemPatch } from "@/lib/boards-client";
import {
  type BoardReactions,
  type CreateBoardItemInput,
  addBoardComment,
  createBoardItem,
  deleteBoardComment,
  deleteBoardItem,
  getBoard,
  getBoardComments,
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

export async function uploadBoardImageAction(
  agencyId: string,
  projectId: string,
  formData: FormData,
): Promise<{ item?: BoardItem; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No image selected" };
  }
  const num = (key: string) => Number(formData.get(key) ?? 0);
  try {
    const item = await uploadBoardImage(agencyId, projectId, file, {
      x: num("x"),
      y: num("y"),
      width: num("width") || undefined,
      height: num("height") || undefined,
    });
    return { item };
  } catch (error) {
    return fail(error, "Unable to upload the image");
  }
}

export async function resyncBoardAction(
  agencyId: string,
  projectId: string,
): Promise<{ items?: BoardItem[]; error?: string }> {
  try {
    return { items: (await getBoard(agencyId, projectId)).items };
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
    return { result: await toggleBoardReaction(agencyId, projectId, itemId, kind) };
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
    return { comment: await addBoardComment(agencyId, projectId, itemId, body) };
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
