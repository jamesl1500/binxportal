/**
 * timeline-client.ts
 *
 * Team timeline types and pure helpers that are safe in a Client Component
 * (no `lib/auth.ts` / `next/headers` dependency) — same split as
 * imports-client.ts. `lib/timeline.ts` does the actual requests.
 *
 * @module apps/binx-web/src/lib/timeline-client.ts
 */
import type { Schemas } from "@/lib/api-types";

export type TimelineFeed = Schemas["TimelineFeedRead"];
export type TimelinePost = Schemas["TimelinePostRead"];
export type TimelineComment = Schemas["TimelineCommentRead"];
export type TimelineAuthor = Schemas["TimelineAuthor"];
export type TimelineReactionSummary = Schemas["TimelineReactionSummary"];
export type TimelineReactionKey = TimelineReactionSummary["reaction"];

/** Same limits binx-api enforces (timeline/models.py). */
export const POST_MAX_CHARS = 5000;
export const COMMENT_MAX_CHARS = 2000;

/** The fixed reaction set, in display order. "like" is the one-tap default. */
export const REACTIONS: { key: TimelineReactionKey; emoji: string; label: string }[] = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
  { key: "laugh", emoji: "😂", label: "Haha" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "thanks", emoji: "🙏", label: "Thanks" },
];

export function reactionEmoji(key: TimelineReactionKey): string {
  return REACTIONS.find((reaction) => reaction.key === key)?.emoji ?? "👍";
}

/** A teammate the composer can @mention. */
export interface MentionableMember {
  user_name: string;
  full_name: string;
}

/**
 * Matches an @handle the same way binx-api's timeline/messaging _MENTION_RE
 * does, so what's highlighted is exactly what notifies someone.
 */
export const MENTION_RE = /(?<![\w@])@([A-Za-z0-9_.-]{2,255})/g;

/** Splits a body into text and @mention segments for rendering. */
export function mentionSegments(
  body: string,
  known: ReadonlySet<string>,
): { text: string; mention: boolean }[] {
  const segments: { text: string; mention: boolean }[] = [];
  let cursor = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    if (!known.has(match[1].toLowerCase())) continue;
    if (start > cursor) segments.push({ text: body.slice(cursor, start), mention: false });
    segments.push({ text: match[0], mention: true });
    cursor = start + match[0].length;
  }
  if (cursor < body.length) segments.push({ text: body.slice(cursor), mention: false });
  return segments;
}

/** Replaces one post in a list (by id), leaving the rest untouched. */
export function replacePost(posts: TimelinePost[], updated: TimelinePost): TimelinePost[] {
  return posts.map((post) => (post.id === updated.id ? updated : post));
}
