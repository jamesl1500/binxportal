/**
 * NotificationBell.tsx
 *
 * The header's notifications dropdown: a bell with an unread badge and a Base
 * UI Menu listing the most recent notifications. Live over the shared
 * per-user event socket (see useRealtimeSocket) — a new notification pops a
 * toast and updates the badge/list immediately, no poll required. The
 * interval poll is now just a belt-and-braces fallback for whenever the
 * socket isn't open (offline, reconnecting), same pattern MessagingProvider
 * uses. Clicking a row marks it read and navigates to its link. A footer
 * offers "Mark all as read" and a link to the full `/notifications` page.
 *
 * @module apps/binx-web/src/components/notifications/NotificationBell/NotificationBell.tsx
 * @author Binx.io
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { AtSign, Bell, FolderKanban, Receipt, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import {
  getNotificationsAction,
  getUnreadCountAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import { useRealtimeSocket, type RealtimeEvent } from "@/hooks/useRealtimeSocket";
import type { AppNotification } from "@/lib/notifications";
import { NOTIFICATION_CATEGORY_META, relativeTime, type NotificationCategory } from "@/lib/notifications-client";

import styles from "./NotificationBell.module.scss";

const RECONCILE_CHECK_MS = 20_000;
const DROPDOWN_LIMIT = 8;

const CATEGORY_ICON: Record<NotificationCategory, LucideIcon> = {
  team: Users,
  invoicing: Receipt,
  projects: FolderKanban,
  messages: AtSign,
};

interface NotificationBellProps {
  initialUnreadCount: number;
  initialItems: AppNotification[];
}

const NotificationBell = ({ initialUnreadCount, initialItems }: NotificationBellProps) => {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<AppNotification[]>(initialItems);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    setUnreadCount(await getUnreadCountAction());
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    const result = await getNotificationsAction({ limit: DROPDOWN_LIMIT });
    setLoading(false);
    if (result.page) {
      setItems(result.page.items);
      setUnreadCount(result.page.unread_count);
    }
  }, []);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (event.type !== "notification.created") return;
    const notification = event.data as AppNotification;

    setItems((prev) => [notification, ...prev].slice(0, DROPDOWN_LIMIT));
    setUnreadCount((count) => count + 1);

    toast(notification.title, {
      description: notification.body ?? undefined,
      action: notification.link ? { label: "View", onClick: () => router.push(notification.link!) } : undefined,
    });
  }, [router]);

  const socketStatus = useRealtimeSocket(handleRealtimeEvent);

  // Belt-and-braces: if the socket isn't open (offline, still reconnecting),
  // fall back to polling the count so the badge doesn't go stale for long —
  // same pattern MessagingProvider uses for its conversation list. Also
  // reconciles on tab focus, since a missed event while backgrounded/asleep
  // won't have replayed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshCount);
    const interval = setInterval(() => {
      if (socketStatus !== "open") refreshCount();
    }, RECONCILE_CHECK_MS);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshCount);
    };
  }, [refreshCount, socketStatus]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refreshList();
  };

  const handleOpen = (notification: AppNotification) => {
    if (!notification.read_at) {
      setItems((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      void markNotificationReadAction(notification.id);
    }
    setOpen(false);
    if (notification.link) router.push(notification.link);
  };

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    await markAllNotificationsReadAction();
  };

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Menu.Root open={open} onOpenChange={handleOpenChange}>
      <Menu.Trigger
        className={styles.trigger}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className={styles.bell} aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.badge}>{badge}</span>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={styles.positioner} sideOffset={8} align="end">
          <Menu.Popup className={styles.popup}>
            <div className={styles.head}>
              <span className={styles.headTitle}>Notifications</span>
              {unreadCount > 0 && (
                <button type="button" className={styles.markAll} onClick={handleMarkAll}>
                  Mark all as read
                </button>
              )}
            </div>

            <div className={styles.list}>
              {loading && items.length === 0 ? (
                <p className={styles.empty}>Loading…</p>
              ) : items.length === 0 ? (
                <p className={styles.empty}>You&apos;re all caught up.</p>
              ) : (
                items.map((notification) => {
                  const Icon = CATEGORY_ICON[notification.category] ?? Bell;
                  const meta = NOTIFICATION_CATEGORY_META[notification.category];
                  return (
                    <Menu.Item
                      key={notification.id}
                      className={styles.item}
                      data-unread={!notification.read_at}
                      onClick={() => handleOpen(notification)}
                    >
                      <span className={styles.iconChip} style={{ color: meta?.accent }} aria-hidden="true">
                        <Icon />
                      </span>
                      <span className={styles.body}>
                        <span className={styles.itemTitle}>{notification.title}</span>
                        {notification.body && <span className={styles.itemBody}>{notification.body}</span>}
                        <span className={styles.time}>{relativeTime(notification.created_at)}</span>
                      </span>
                      {!notification.read_at && <span className={styles.dot} aria-hidden="true" />}
                    </Menu.Item>
                  );
                })
              )}
            </div>

            <Menu.LinkItem
              render={<Link href="/notifications" />}
              className={styles.viewAll}
              closeOnClick
            >
              View all notifications
            </Menu.LinkItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default NotificationBell;
