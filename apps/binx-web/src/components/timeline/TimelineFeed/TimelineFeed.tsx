/**
 * TimelineFeed.tsx
 *
 * The team timeline on the dashboard: a composer, the pinned posts, then
 * everyone's posts newest first with "Load more". Seeded with the first page
 * from the server render; after that it keeps its own state. Every server
 * action returns the updated post, which replaces the old one in place (see
 * dashboard/timeline/actions.ts for why there's no refresh()).
 *
 * A notification links to `/dashboard/timeline#post-<id>`; when that post is
 * on the page it's scrolled to and briefly highlighted.
 *
 * Beside the feed (above it on narrow screens) sits TimelineSidebar: your
 * week, upcoming meetings, people to celebrate, wins, and this week's
 * numbers. Its "Say congrats" buttons start a post here via `startPost`.
 *
 * @module apps/binx-web/src/components/timeline/TimelineFeed/TimelineFeed.tsx
 */
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Newspaper } from "lucide-react";

import { createTimelinePostAction, loadTimelinePageAction } from "@/app/(app)/dashboard/timeline/actions";
import MentionTextarea from "@/components/ui/MentionTextarea/MentionTextarea";
import TimelinePostCard from "@/components/timeline/TimelinePostCard/TimelinePostCard";
import TimelineSidebar from "@/components/timeline/TimelineSidebar/TimelineSidebar";
import type { Schemas } from "@/lib/api-types";
import {
  POST_MAX_CHARS,
  replacePost,
  type MentionableMember,
  type TimelineFeed as Feed,
  type TimelineHighlights,
  type TimelinePost,
} from "@/lib/timeline-client";

import styles from "./TimelineFeed.module.scss";

interface TimelineFeedProps {
  agencyId: string;
  initialFeed: Feed;
  members: MentionableMember[];
  /** The side rail's data; the rail is left out when both are missing. */
  highlights?: TimelineHighlights | null;
  myWork?: Schemas["MyWorkRead"] | null;
  currentUserId?: string | null;
}

const HIGHLIGHT_MS = 2500;

const TimelineFeed = ({
  agencyId,
  initialFeed,
  members,
  highlights = null,
  myWork = null,
  currentUserId = null,
}: TimelineFeedProps) => {
  const [pinned, setPinned] = useState(initialFeed.pinned);
  const [posts, setPosts] = useState(initialFeed.posts);
  const [cursor, setCursor] = useState(initialFeed.next_cursor);
  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [isPosting, startPosting] = useTransition();
  const [isLoading, startLoading] = useTransition();
  const canModerate = initialFeed.can_moderate;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusComposerRef = useRef(false);

  // After startPost fills the draft: focus the composer with the caret at
  // the end, and bring it into view (it may be far up the page).
  useEffect(() => {
    if (!focusComposerRef.current) return;
    focusComposerRef.current = false;
    const node = composerRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
    node.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [draft]);

  /** Starts a post from outside the composer, keeping anything already typed. */
  const startPost = (text: string) => {
    focusComposerRef.current = true;
    setDraft((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
  };

  // Scroll to (and flash) the post a notification linked to.
  useEffect(() => {
    const match = window.location.hash.match(/^#post-([\w-]+)$/);
    if (!match) return;
    const node = document.getElementById(`post-${match[1]}`);
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    const showTimer = window.setTimeout(() => setHighlightId(match[1]), 0);
    const clearTimer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(clearTimer);
    };
  }, []);

  /** A post changed: pinning moves it between the two lists. */
  const handleChange = (updated: TimelinePost) => {
    const wasPinned = pinned.some((post) => post.id === updated.id);
    if (updated.pinned && !wasPinned) {
      setPosts((list) => list.filter((post) => post.id !== updated.id));
      setPinned((list) => [updated, ...list]);
    } else if (!updated.pinned && wasPinned) {
      setPinned((list) => list.filter((post) => post.id !== updated.id));
      setPosts((list) =>
        [updated, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    } else {
      setPinned((list) => replacePost(list, updated));
      setPosts((list) => replacePost(list, updated));
    }
  };

  const handleDelete = (postId: string) => {
    setPinned((list) => list.filter((post) => post.id !== postId));
    setPosts((list) => list.filter((post) => post.id !== postId));
  };

  const submit = () => {
    if (!draft.trim()) return;
    startPosting(async () => {
      const result = await createTimelinePostAction(agencyId, draft, canModerate && announce);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPosts((list) => [result.data, ...list]);
      setDraft("");
      setAnnounce(false);
      if (result.data.is_announcement) toast.success("Announcement posted — everyone's been notified");
    });
  };

  const loadMore = () => {
    if (!cursor) return;
    startLoading(async () => {
      const result = await loadTimelinePageAction(agencyId, cursor);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const seen = new Set(posts.map((post) => post.id));
      setPosts((list) => [...list, ...result.data.posts.filter((post) => !seen.has(post.id))]);
      setCursor(result.data.next_cursor);
    });
  };

  const card = (post: TimelinePost) => (
    <li key={post.id}>
      <TimelinePostCard
        agencyId={agencyId}
        post={post}
        members={members}
        onChange={handleChange}
        onDelete={handleDelete}
        highlighted={highlightId === post.id}
      />
    </li>
  );

  const showRail = highlights !== null || myWork !== null;

  return (
    <div className={styles.layout} data-rail={showRail}>
      {showRail && (
        <aside className={styles.aside} aria-label="Timeline highlights">
          <TimelineSidebar
            agencyId={agencyId}
            currentUserId={currentUserId}
            highlights={highlights}
            myWork={myWork}
            onStartPost={startPost}
          />
        </aside>
      )}
    <div className={styles.feed}>
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <MentionTextarea
          ref={composerRef}
          value={draft}
          onChange={setDraft}
          members={members}
          onSubmit={submit}
          placeholder="Share an update with the team… (@ to mention someone)"
          maxLength={POST_MAX_CHARS}
          ariaLabel="New timeline post"
          disabled={isPosting}
          minRows={3}
        />
        <div className={styles.composerFooter}>
          {canModerate ? (
            <label className={styles.announce}>
              <input type="checkbox" checked={announce} onChange={(event) => setAnnounce(event.target.checked)} />
              Announcement — notify everyone
            </label>
          ) : (
            <span />
          )}
          <div className={styles.composerActions}>
            <span className={styles.hint}>⌘/Ctrl + Enter to post</span>
            <button type="submit" className={styles.postButton} disabled={isPosting || !draft.trim()}>
              {isPosting ? "Posting…" : announce ? "Post announcement" : "Post"}
            </button>
          </div>
        </div>
      </form>

      {pinned.length > 0 && (
        <section aria-labelledby="timeline-pinned">
          <h2 id="timeline-pinned" className={styles.sectionLabel}>
            Pinned
          </h2>
          <ul className={styles.list}>{pinned.map(card)}</ul>
        </section>
      )}

      <section aria-labelledby="timeline-latest">
        <h2 id="timeline-latest" className={styles.sectionLabel}>
          Latest
        </h2>
        {posts.length === 0 ? (
          <div className={styles.empty}>
            <Newspaper aria-hidden="true" />
            <p>Nothing here yet. Post the first update — a win, a heads-up, or what you&apos;re working on.</p>
          </div>
        ) : (
          <ul className={styles.list}>{posts.map(card)}</ul>
        )}
        {cursor && (
          <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
    </div>
  );
};

export default TimelineFeed;
