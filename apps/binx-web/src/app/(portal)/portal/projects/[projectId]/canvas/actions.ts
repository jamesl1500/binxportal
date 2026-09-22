/**
 * actions.ts - Portal project canvas (client contact)
 *
 * The client-facing half of the shared project canvas. Same thin-wrapper shape
 * as the staff canvas actions, against the portal-scoped endpoints in
 * `lib/portal.ts`. binx-api broadcasts every change, so no `router.refresh()`.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/canvas/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import type { BoardReactions, CreateBoardItemInput } from "@/lib/boards";
import type { BoardComment, BoardItem, BoardItemPatch } from "@/lib/boards-client";
import {
  addPortalBoardComment,
  createPortalBoardItem,
  decidePortalBoardApproval,
  deletePortalBoardComment,
  deletePortalBoardItem,
  getPortalBoard,
  getPortalBoardComments,
  togglePortalBoardReaction,
  updatePortalBoardItem,
  uploadPortalBoardImage,
} from "@/lib/portal";

function fail(error: unknown, fallback: string): { error: string } {
  return { error: error instanceof AuthApiError ? error.message : fallback };
}

export async function createPortalBoardItemAction(
  projectId: string,
  input: CreateBoardItemInput,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await createPortalBoardItem(projectId, input) };
  } catch (error) {
    return fail(error, "Unable to add the card");
  }
}

export async function updatePortalBoardItemAction(
  projectId: string,
  itemId: string,
  patch: BoardItemPatch,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await updatePortalBoardItem(projectId, itemId, patch) };
  } catch (error) {
    return fail(error, "Unable to update the card");
  }
}

export async function deletePortalBoardItemAction(
  projectId: string,
  itemId: string,
): Promise<{ error?: string }> {
  try {
    await deletePortalBoardItem(projectId, itemId);
    return {};
  } catch (error) {
    return fail(error, "Unable to delete the card");
  }
}

export async function uploadPortalBoardImageAction(
  projectId: string,
  formData: FormData,
): Promise<{ item?: BoardItem; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No image selected" };
  }
  const num = (key: string) => Number(formData.get(key) ?? 0);
  try {
    const item = await uploadPortalBoardImage(projectId, file, {
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

export async function resyncPortalBoardAction(
  projectId: string,
): Promise<{ items?: BoardItem[]; error?: string }> {
  try {
    return { items: (await getPortalBoard(projectId)).items };
  } catch (error) {
    return fail(error, "Unable to reload the canvas");
  }
}

export async function togglePortalReactionAction(
  projectId: string,
  itemId: string,
  kind: string,
): Promise<{ result?: BoardReactions; error?: string }> {
  try {
    return { result: await togglePortalBoardReaction(projectId, itemId, kind) };
  } catch (error) {
    return fail(error, "Unable to react");
  }
}

export async function listPortalCommentsAction(
  projectId: string,
  itemId: string,
): Promise<{ comments?: BoardComment[]; error?: string }> {
  try {
    return { comments: await getPortalBoardComments(projectId, itemId) };
  } catch (error) {
    return fail(error, "Unable to load comments");
  }
}

export async function addPortalCommentAction(
  projectId: string,
  itemId: string,
  body: string,
): Promise<{ comment?: BoardComment; error?: string }> {
  try {
    return { comment: await addPortalBoardComment(projectId, itemId, body) };
  } catch (error) {
    return fail(error, "Unable to add the comment");
  }
}

export async function deletePortalCommentAction(
  projectId: string,
  itemId: string,
  commentId: string,
): Promise<{ error?: string }> {
  try {
    await deletePortalBoardComment(projectId, itemId, commentId);
    return {};
  } catch (error) {
    return fail(error, "Unable to delete the comment");
  }
}

export async function decideApprovalAction(
  projectId: string,
  itemId: string,
  decision: "approved" | "changes_requested",
  note?: string,
): Promise<{ item?: BoardItem; error?: string }> {
  try {
    return { item: await decidePortalBoardApproval(projectId, itemId, decision, note) };
  } catch (error) {
    return fail(error, "Unable to record your decision");
  }
}
