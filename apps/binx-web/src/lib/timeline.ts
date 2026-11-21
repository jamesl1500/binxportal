/**
 * timeline.ts
 *
 * Server-only calls to binx-api's team timeline (`/agencies/{id}/timeline`).
 * Client Components go through the server actions in
 * app/(app)/dashboard/timeline/actions.ts and use the types/helpers in
 * `timeline-client.ts`.
 *
 * @module apps/binx-web/src/lib/timeline.ts
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import { apiPath } from "@/lib/file-proxy";
import type {
  TimelineComment,
  TimelineFeed,
  TimelineHighlights,
  TimelinePost,
  TimelineReactionKey,
} from "@/lib/timeline-client";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

async function call<T>(fallback: string, request: (headers: { Authorization: string }) => Promise<{ data: T }>) {
  const headers = await authHeader();
  try {
    return (await request(headers)).data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
    }
    throw error;
  }
}

const base = (agencyId: string) => apiPath`/agencies/${agencyId}/timeline`;

/** One page of the feed; pinned posts come with the first page (no cursor). */
export function getTimelineFeed(agencyId: string, cursor?: string | null): Promise<TimelineFeed> {
  return call("Unable to load the timeline", (headers) =>
    api.get<TimelineFeed>(base(agencyId), { headers, params: cursor ? { cursor } : undefined }),
  );
}

/** The side rail: upcoming meetings, people to celebrate, wins, and this week's numbers. */
export function getTimelineHighlights(agencyId: string): Promise<TimelineHighlights> {
  return call("Unable to load timeline highlights", (headers) =>
    api.get<TimelineHighlights>(`${base(agencyId)}/highlights`, { headers }),
  );
}

export function createTimelinePost(agencyId: string, body: string, isAnnouncement: boolean): Promise<TimelinePost> {
  return call("Unable to post", (headers) =>
    api.post<TimelinePost>(`${base(agencyId)}/posts`, { body, is_announcement: isAnnouncement }, { headers }),
  );
}

export function updateTimelinePost(agencyId: string, postId: string, body: string): Promise<TimelinePost> {
  return call("Unable to save your changes", (headers) =>
    api.patch<TimelinePost>(apiPath`/agencies/${agencyId}/timeline/posts/${postId}`, { body }, { headers }),
  );
}

export async function deleteTimelinePost(agencyId: string, postId: string): Promise<void> {
  await call("Unable to delete the post", (headers) =>
    api.delete(apiPath`/agencies/${agencyId}/timeline/posts/${postId}`, { headers }),
  );
}

export function setTimelinePostPinned(agencyId: string, postId: string, pinned: boolean): Promise<TimelinePost> {
  return call(pinned ? "Unable to pin the post" : "Unable to unpin the post", (headers) =>
    api.put<TimelinePost>(apiPath`/agencies/${agencyId}/timeline/posts/${postId}/pin`, { pinned }, { headers }),
  );
}

export function setTimelineReaction(
  agencyId: string,
  postId: string,
  reaction: TimelineReactionKey,
  on: boolean,
): Promise<TimelinePost> {
  const path = apiPath`/agencies/${agencyId}/timeline/posts/${postId}/reactions/${reaction}`;
  return call("Unable to react", (headers) =>
    on ? api.put<TimelinePost>(path, undefined, { headers }) : api.delete<TimelinePost>(path, { headers }),
  );
}

export function getTimelineComments(agencyId: string, postId: string): Promise<TimelineComment[]> {
  return call("Unable to load comments", (headers) =>
    api.get<TimelineComment[]>(apiPath`/agencies/${agencyId}/timeline/posts/${postId}/comments`, { headers }),
  );
}

export function createTimelineComment(agencyId: string, postId: string, body: string): Promise<TimelineComment> {
  return call("Unable to comment", (headers) =>
    api.post<TimelineComment>(apiPath`/agencies/${agencyId}/timeline/posts/${postId}/comments`, { body }, { headers }),
  );
}

export function updateTimelineComment(agencyId: string, commentId: string, body: string): Promise<TimelineComment> {
  return call("Unable to save your changes", (headers) =>
    api.patch<TimelineComment>(apiPath`/agencies/${agencyId}/timeline/comments/${commentId}`, { body }, { headers }),
  );
}

export async function deleteTimelineComment(agencyId: string, commentId: string): Promise<void> {
  await call("Unable to delete the comment", (headers) =>
    api.delete(apiPath`/agencies/${agencyId}/timeline/comments/${commentId}`, { headers }),
  );
}

/** One post, freshly read (after a comment changes its count, say). */
export function getTimelinePost(agencyId: string, postId: string): Promise<TimelinePost> {
  return call("Unable to load the post", (headers) =>
    api.get<TimelinePost>(apiPath`/agencies/${agencyId}/timeline/posts/${postId}`, { headers }),
  );
}
