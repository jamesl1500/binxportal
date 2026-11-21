/**
 * actions.ts - Dashboard · Timeline
 *
 * Server actions behind the team timeline. Each returns the updated post or
 * comment (binx-api sends it back) and the client feed swaps it in place, so
 * none of them calls `refresh()`: the feed keeps its own state, including
 * pages loaded with "Load more", and a refresh would re-render the whole
 * dashboard layout just to replace data the feed already has.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/timeline/actions.ts
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  createTimelineComment,
  createTimelinePost,
  deleteTimelineComment,
  deleteTimelinePost,
  getTimelineComments,
  getTimelineFeed,
  getTimelinePost,
  setTimelinePostPinned,
  setTimelineReaction,
  updateTimelineComment,
  updateTimelinePost,
} from "@/lib/timeline";
import type {
  TimelineComment,
  TimelineFeed,
  TimelinePost,
  TimelineReactionKey,
} from "@/lib/timeline-client";

export type TimelineActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fallback: string, work: () => Promise<T>): Promise<TimelineActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, error: error instanceof AuthApiError ? error.message : fallback };
  }
}

export async function loadTimelinePageAction(
  agencyId: string,
  cursor: string,
): Promise<TimelineActionResult<TimelineFeed>> {
  return run("Unable to load more posts", () => getTimelineFeed(agencyId, cursor));
}

export async function createTimelinePostAction(
  agencyId: string,
  body: string,
  isAnnouncement: boolean,
): Promise<TimelineActionResult<TimelinePost>> {
  return run("Unable to post", () => createTimelinePost(agencyId, body, isAnnouncement));
}

export async function updateTimelinePostAction(
  agencyId: string,
  postId: string,
  body: string,
): Promise<TimelineActionResult<TimelinePost>> {
  return run("Unable to save your changes", () => updateTimelinePost(agencyId, postId, body));
}

export async function deleteTimelinePostAction(
  agencyId: string,
  postId: string,
): Promise<TimelineActionResult<true>> {
  return run("Unable to delete the post", async () => {
    await deleteTimelinePost(agencyId, postId);
    return true as const;
  });
}

export async function pinTimelinePostAction(
  agencyId: string,
  postId: string,
  pinned: boolean,
): Promise<TimelineActionResult<TimelinePost>> {
  return run("Unable to update the pin", () => setTimelinePostPinned(agencyId, postId, pinned));
}

export async function reactToTimelinePostAction(
  agencyId: string,
  postId: string,
  reaction: TimelineReactionKey,
  on: boolean,
): Promise<TimelineActionResult<TimelinePost>> {
  return run("Unable to react", () => setTimelineReaction(agencyId, postId, reaction, on));
}

export async function loadTimelineCommentsAction(
  agencyId: string,
  postId: string,
): Promise<TimelineActionResult<TimelineComment[]>> {
  return run("Unable to load comments", () => getTimelineComments(agencyId, postId));
}

/** Adds a comment and returns the post re-read, so its count and latest comments are current. */
export async function createTimelineCommentAction(
  agencyId: string,
  postId: string,
  body: string,
): Promise<TimelineActionResult<{ comment: TimelineComment; post: TimelinePost }>> {
  return run("Unable to comment", async () => {
    const comment = await createTimelineComment(agencyId, postId, body);
    return { comment, post: await getTimelinePost(agencyId, postId) };
  });
}

export async function updateTimelineCommentAction(
  agencyId: string,
  commentId: string,
  body: string,
): Promise<TimelineActionResult<TimelineComment>> {
  return run("Unable to save your changes", () => updateTimelineComment(agencyId, commentId, body));
}

/** Deletes a comment and returns the post re-read (count and latest comments). */
export async function deleteTimelineCommentAction(
  agencyId: string,
  postId: string,
  commentId: string,
): Promise<TimelineActionResult<TimelinePost>> {
  return run("Unable to delete the comment", async () => {
    await deleteTimelineComment(agencyId, commentId);
    return getTimelinePost(agencyId, postId);
  });
}
