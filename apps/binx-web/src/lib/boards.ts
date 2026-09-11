/**
 * boards.ts
 *
 * Server-only helpers for binx-api's project collaboration canvas —
 * `/agencies/{agencyId}/projects/{projectId}/canvas/*`. Same shape as
 * `lib/leads.ts`: attach the access token, map errors to `AuthApiError`. The
 * client-portal contact hits the mirrored `/portal/projects/{id}/canvas/*`
 * endpoints via `lib/portal.ts`.
 *
 * @module apps/binx-web/src/lib/boards.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { Board, BoardComment, BoardItem, BoardItemPatch, BoardItemType } from "@/lib/boards-client";

export type { Board, BoardComment, BoardItem, BoardItemPatch, BoardItemType };

export type BoardReactions = Schemas["BoardReactionsRead"];

export interface CreateBoardItemInput {
  type: BoardItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: Record<string, unknown>;
  color?: string | null;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrow(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error) && error.response) {
    throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  throw error;
}

function base(agencyId: string, projectId: string): string {
  return `/agencies/${agencyId}/projects/${projectId}/canvas`;
}

export async function getBoard(agencyId: string, projectId: string): Promise<Board> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Board>(base(agencyId, projectId), { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to load the canvas");
  }
}

export async function createBoardItem(
  agencyId: string,
  projectId: string,
  input: CreateBoardItemInput,
): Promise<BoardItem> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardItem>(`${base(agencyId, projectId)}/items`, input, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to add the card");
  }
}

export async function updateBoardItem(
  agencyId: string,
  projectId: string,
  itemId: string,
  patch: BoardItemPatch,
): Promise<BoardItem> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<BoardItem>(`${base(agencyId, projectId)}/items/${itemId}`, patch, { headers });
    return data;
  } catch (error) {
    rethrow(error, "Unable to update the card");
  }
}

export async function deleteBoardItem(agencyId: string, projectId: string, itemId: string): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${base(agencyId, projectId)}/items/${itemId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete the card");
  }
}

export async function uploadBoardImage(
  agencyId: string,
  projectId: string,
  file: File,
  placement: { x: number; y: number; width?: number; height?: number },
): Promise<BoardItem> {
  const headers = await authHeader();
  const form = new FormData();
  form.append("file", file);
  try {
    const { data } = await api.post<BoardItem>(`${base(agencyId, projectId)}/images`, form, {
      headers: { ...headers, "Content-Type": undefined },
      params: placement,
    });
    return data;
  } catch (error) {
    rethrow(error, "Unable to upload the image");
  }
}

export async function toggleBoardReaction(
  agencyId: string,
  projectId: string,
  itemId: string,
  kind: string,
): Promise<BoardReactions> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardReactions>(
      `${base(agencyId, projectId)}/items/${itemId}/reactions`,
      { kind },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to react");
  }
}

export async function getBoardComments(
  agencyId: string,
  projectId: string,
  itemId: string,
): Promise<BoardComment[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<BoardComment[]>(
      `${base(agencyId, projectId)}/items/${itemId}/comments`,
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to load comments");
  }
}

export async function addBoardComment(
  agencyId: string,
  projectId: string,
  itemId: string,
  body: string,
): Promise<BoardComment> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<BoardComment>(
      `${base(agencyId, projectId)}/items/${itemId}/comments`,
      { body },
      { headers },
    );
    return data;
  } catch (error) {
    rethrow(error, "Unable to add the comment");
  }
}

export async function deleteBoardComment(
  agencyId: string,
  projectId: string,
  itemId: string,
  commentId: string,
): Promise<void> {
  const headers = await authHeader();
  try {
    await api.delete(`${base(agencyId, projectId)}/items/${itemId}/comments/${commentId}`, { headers });
  } catch (error) {
    rethrow(error, "Unable to delete the comment");
  }
}
