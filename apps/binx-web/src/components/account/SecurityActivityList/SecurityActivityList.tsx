/**
 * SecurityActivityList.tsx
 *
 * A read-only list of the signed-in user's own security events (sign-ins,
 * password and email changes) for the account settings page. Private to the
 * account — never shown to teammates. Seeded with the first page from the
 * server, with offset-paginated "Load more". A new event also arrives live
 * over the shared per-user event socket (useRealtimeSocket) and is prepended
 * in place — no toast (matches ActivityFeed's own reasoning: this is a log,
 * not an actionable prompt).
 *
 * @module apps/binx-web/src/components/account/SecurityActivityList/SecurityActivityList.tsx
 * @author Binx.io
 */
"use client";

import { useCallback, useState, useTransition } from "react";

import { getMyActivityAction } from "@/app/(app)/activity/actions";
import { useRealtimeSocket, type RealtimeEvent } from "@/hooks/useRealtimeSocket";
import type { ActivityEntry, ActivityPage } from "@/lib/activity";
import { relativeTime } from "@/lib/notifications-client";

import styles from "./SecurityActivityList.module.scss";

const PAGE_SIZE = 15;

function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface SecurityActivityListProps {
  initialPage: ActivityPage;
}

const SecurityActivityList = ({ initialPage }: SecurityActivityListProps) => {
  const [items, setItems] = useState<ActivityEntry[]>(initialPage.items);
  const [hasMore, setHasMore] = useState(initialPage.has_more);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadMore = () => {
    setError(null);
    startTransition(async () => {
      const result = await getMyActivityAction({ limit: PAGE_SIZE, offset: items.length });
      if (result.error || !result.page) {
        setError(result.error ?? "Unable to load more");
        return;
      }
      setHasMore(result.page.has_more);
      setItems((prev) => [...prev, ...result.page!.items]);
    });
  };

  // This user's own socket also carries their agency's team activity (if
  // they belong to one) — only a "security"-category entry belongs here,
  // mirroring ActivityFeed's inverse filter (which drops "security").
  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== "activity.created") return;
    const entry = event.data as ActivityEntry;
    if (entry.category !== "security") return;
    setItems((prev) => [entry, ...prev]);
  }, []);
  useRealtimeSocket(handleRealtimeEvent);

  if (items.length === 0) {
    return <p className={styles.empty}>No recent security activity.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <ul className={styles.list}>
        {items.map((entry) => (
          <li key={entry.id} className={styles.row}>
            <span className={styles.summary}>{entry.summary}</span>
            <time className={styles.time} dateTime={entry.created_at} title={fullTimestamp(entry.created_at)}>
              {relativeTime(entry.created_at)}
            </time>
          </li>
        ))}
      </ul>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {hasMore && (
        <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isPending}>
          {isPending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
};

export default SecurityActivityList;
