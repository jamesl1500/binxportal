/**
 * ActivityFeed.tsx
 *
 * The agency-wide activity log: category filter chips, a timeline of entries
 * (actor initial, summary, relative time, an "Admins only" tag on sensitive
 * rows), and offset-paginated "Load more". Seeded with the first page from the
 * server; every filter change and page fetch goes through the activity
 * actions. New entries also arrive live over the shared per-user event socket
 * (useRealtimeSocket) and get prepended in place — deliberately no toast for
 * these; an audit-log-style feed popping up for every teammate's task move
 * would be far too noisy (compare NotificationBell, which does toast).
 *
 * @module apps/binx-web/src/components/activity/ActivityFeed/ActivityFeed.tsx
 * @author Binx.io
 */
"use client";

import { useCallback, useState, useTransition } from "react";
import { AtSign, FileText, FolderKanban, Receipt, Settings, Users, type LucideIcon } from "lucide-react";

import { getAgencyActivityAction } from "@/app/(app)/activity/actions";
import { useRealtimeSocket, type RealtimeEvent } from "@/hooks/useRealtimeSocket";
import type { ActivityEntry, ActivityPage } from "@/lib/activity";
import {
  ACTIVITY_CATEGORY_META,
  AGENCY_ACTIVITY_CATEGORIES,
  type ActivityCategory,
} from "@/lib/activity-client";
import { relativeTime } from "@/lib/notifications-client";

import styles from "./ActivityFeed.module.scss";

const PAGE_SIZE = 30;

const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  team: Users,
  clients: FileText,
  projects: FolderKanban,
  invoicing: Receipt,
  settings: Settings,
  security: AtSign,
};

type Filter = "all" | Exclude<ActivityCategory, "security">;

function initials(name: string | null): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

interface ActivityFeedProps {
  agencyId: string;
  initialPage: ActivityPage;
}

const ActivityFeed = ({ agencyId, initialPage }: ActivityFeedProps) => {
  const [items, setItems] = useState<ActivityEntry[]>(initialPage.items);
  const [hasMore, setHasMore] = useState(initialPage.has_more);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = (nextFilter: Filter, offset: number) => {
    setError(null);
    startTransition(async () => {
      const result = await getAgencyActivityAction(agencyId, {
        category: nextFilter === "all" ? undefined : nextFilter,
        limit: PAGE_SIZE,
        offset,
      });
      if (result.error || !result.page) {
        setError(result.error ?? "Unable to load activity");
        return;
      }
      setHasMore(result.page.has_more);
      setItems((prev) => (offset === 0 ? result.page!.items : [...prev, ...result.page!.items]));
    });
  };

  const switchFilter = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    setItems([]);
    load(next, 0);
  };

  // account-security entries (log_account_activity) ride the same socket as
  // agency entries — they're never part of this feed (see binx-api's
  // activity/service.py module docstring), so a stray one is dropped here.
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type !== "activity.created") return;
      const entry = event.data as ActivityEntry;
      if (entry.category === "security") return;
      if (filter !== "all" && entry.category !== filter) return;
      setItems((prev) => [entry, ...prev]);
    },
    [filter],
  );
  useRealtimeSocket(handleRealtimeEvent);

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips} role="group" aria-label="Filter activity by area">
        <button
          type="button"
          className={styles.chip}
          data-active={filter === "all"}
          aria-pressed={filter === "all"}
          onClick={() => switchFilter("all")}
        >
          All
        </button>
        {AGENCY_ACTIVITY_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={styles.chip}
            data-active={filter === category}
            aria-pressed={filter === category}
            onClick={() => switchFilter(category)}
          >
            {ACTIVITY_CATEGORY_META[category].label}
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {items.length === 0 && !isPending ? (
        <p className={styles.empty}>Nothing logged here yet.</p>
      ) : (
        <ol className={styles.list}>
          {items.map((entry) => {
            const Icon = CATEGORY_ICON[entry.category] ?? Users;
            const meta = ACTIVITY_CATEGORY_META[entry.category];
            return (
              <li key={entry.id} className={styles.row}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(entry.actor_name)}
                </span>
                <div className={styles.body}>
                  <p className={styles.summary}>{entry.summary}</p>
                  <p className={styles.meta}>
                    <span className={styles.tag} style={{ color: meta?.accent }}>
                      <Icon className={styles.tagIcon} aria-hidden="true" />
                      {meta?.label}
                    </span>
                    <span className={styles.time}>{relativeTime(entry.created_at)}</span>
                    {entry.visibility === "admin" && <span className={styles.adminTag}>Admins only</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={() => load(filter, items.length)}
          disabled={isPending}
        >
          {isPending ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
};

export default ActivityFeed;
