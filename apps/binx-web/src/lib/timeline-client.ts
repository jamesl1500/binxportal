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
import { memberImageUrl } from "@/lib/users-client";

export type TimelineFeed = Schemas["TimelineFeedRead"];
export type TimelinePost = Schemas["TimelinePostRead"];
export type TimelineComment = Schemas["TimelineCommentRead"];
export type TimelineAuthor = Schemas["TimelineAuthor"];
export type TimelineReactionSummary = Schemas["TimelineReactionSummary"];
export type TimelineReactionKey = TimelineReactionSummary["reaction"];
export type TimelineHighlights = Schemas["TimelineHighlightsRead"];
export type TimelineCelebration = Schemas["TimelineCelebration"];
export type TimelineWin = Schemas["TimelineWin"];
export type TimelineUpcomingMeeting = Schemas["TimelineUpcomingMeeting"];

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

/** The author's avatar (via the member image route), or null for initials. */
export function authorAvatarSrc(agencyId: string, author: TimelineAuthor): string | null {
  return author.has_avatar && author.member_id
    ? memberImageUrl(agencyId, author.member_id, "avatar", author.avatar_version)
    : null;
}

const WIN_ROUTES: Record<string, string> = {
  client: "/clients",
  invoice: "/invoices",
  project: "/projects",
  proposal: "/proposals",
};

/** Where a win links to (its client, invoice, project or proposal), if anywhere. */
export function winHref(win: Pick<TimelineWin, "target_type" | "target_id">): string | null {
  const route = win.target_type ? WIN_ROUTES[win.target_type] : undefined;
  return route && win.target_id ? `${route}/${win.target_id}` : null;
}

/** The post "Say congrats" starts in the composer. */
export function celebrationDraft(celebration: Pick<TimelineCelebration, "kind" | "user_name" | "years">): string {
  if (celebration.kind === "joined") {
    return `👋 Welcome to the team, @${celebration.user_name}! `;
  }
  return `🎉 Happy ${celebration.years}-year work anniversary, @${celebration.user_name}! `;
}

/**
 * Whole days from `today` to a "YYYY-MM-DD" date (negative = in the past),
 * compared as calendar dates so the viewer's timezone can't shift it by one.
 */
export function daysFromToday(day: string, today: Date = new Date()): number {
  const [year, month, date] = day.split("-").map(Number);
  const target = Date.UTC(year, month - 1, date);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86_400_000);
}

/** "today" / "tomorrow" / "yesterday" / "in 3 days" / "3 days ago". */
export function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
