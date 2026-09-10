/**
 * NotificationList.tsx
 *
 * The body of the `/notifications` page: All / Unread filter tabs, a
 * "Mark all as read" action, the rows themselves (click to open, X to
 * dismiss), and offset-paginated "Load more". Seeded with the first page from
 * the server; every subsequent fetch goes through the notification actions.
 *
 * @module apps/binx-web/src/components/notifications/NotificationList/NotificationList.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, FolderKanban, Receipt, Users, X, type LucideIcon } from "lucide-react";

import {
  dismissNotificationAction,
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import type { AppNotification, NotificationPage } from "@/lib/notifications";
import { NOTIFICATION_CATEGORY_META, relativeTime, type NotificationCategory } from "@/lib/notifications-client";

import styles from "./NotificationList.module.scss";

const PAGE_SIZE = 20;

const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  team: Users,
  invoicing: Receipt,
  projects: FolderKanban,
  messages: AtSign,
};

type Filter = "all" | "unread";

interface NotificationListProps {
  initialPage: NotificationPage;
}

const NotificationList = ({ initialPage }: NotificationListProps) => {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>(initialPage.items);
  const [unreadCount, setUnreadCount] = useState(initialPage.unread_count);
  const [hasMore, setHasMore] = useState(initialPage.has_more);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = (nextFilter: Filter, offset: number) => {
    setError(null);
    startTransition(async () => {
      const result = await getNotificationsAction({
        unreadOnly: nextFilter === "unread",
        limit: PAGE_SIZE,
        offset,
      });
      if (result.error || !result.page) {
        setError(result.error ?? "Unable to load notifications");
        return;
      }
      setUnreadCount(result.page.unread_count);
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

  const open = (notification: AppNotification) => {
    if (!notification.read_at) {
      markRead(notification.id, false);
      void markNotificationReadAction(notification.id);
    }
    if (notification.link) router.push(notification.link);
  };

  const markRead = (id: string, callServer = true) => {
    setItems((prev) =>
      filter === "unread"
        ? prev.filter((n) => n.id !== id)
        : prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    if (callServer) void markNotificationReadAction(id);
  };

  const dismiss = (id: string) => {
    const removed = items.find((n) => n.id === id);
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (removed && !removed.read_at) setUnreadCount((c) => Math.max(0, c - 1));
    void dismissNotificationAction(id);
  };

  const markAll = () => {
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    if (filter === "unread") setItems([]);
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filter notifications">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={styles.tab}
            data-active={filter === "all"}
            onClick={() => switchFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "unread"}
            className={styles.tab}
            data-active={filter === "unread"}
            onClick={() => switchFilter("unread")}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        </div>
        <button type="button" className={styles.markAll} onClick={markAll} disabled={unreadCount === 0}>
          Mark all as read
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {items.length === 0 && !isPending ? (
        <p className={styles.empty}>
          {filter === "unread" ? "Nothing unread." : "No notifications yet."}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((notification) => {
            const Icon = CATEGORY_ICON[notification.category] ?? Bell;
            const meta = NOTIFICATION_CATEGORY_META[notification.category];
            return (
              <li key={notification.id} className={styles.row} data-unread={!notification.read_at}>
                <button type="button" className={styles.rowMain} onClick={() => open(notification)}>
                  <span className={styles.iconChip} style={{ color: meta?.accent }} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className={styles.body}>
                    <span className={styles.title}>{notification.title}</span>
                    {notification.body && <span className={styles.detail}>{notification.body}</span>}
                    <span className={styles.meta}>
                      {meta?.label} · {relativeTime(notification.created_at)}
                    </span>
                  </span>
                  {!notification.read_at && <span className={styles.dot} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={styles.dismiss}
                  onClick={() => dismiss(notification.id)}
                  aria-label="Dismiss notification"
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
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

export default NotificationList;
