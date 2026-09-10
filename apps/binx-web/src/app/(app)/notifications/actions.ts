/**
 * actions.ts - Notifications
 *
 * Server actions behind the header bell (polled) and the /notifications page:
 * fetching a page, the unread count, and the read/dismiss mutations. Plain
 * authenticated calls — no cookies change — so they go straight to binx-api
 * via `lib/notifications.ts`.
 *
 * @module apps/binx-web/src/app/(app)/notifications/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  type AppNotification,
  type NotificationPage,
  type NotificationQuery,
  dismissNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

export interface NotificationPageActionResult {
  error?: string;
  page?: NotificationPage;
}

export async function getNotificationsAction(query: NotificationQuery = {}): Promise<NotificationPageActionResult> {
  try {
    return { page: await getNotifications(query) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to load notifications" };
  }
}

/** Just the number. Never throws — the poll loop treats any failure as "unchanged". */
export async function getUnreadCountAction(): Promise<number> {
  return getUnreadNotificationCount();
}

export interface MarkReadActionResult {
  error?: string;
  notification?: AppNotification;
}

export async function markNotificationReadAction(notificationId: string): Promise<MarkReadActionResult> {
  try {
    return { notification: await markNotificationRead(notificationId) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update the notification" };
  }
}

export interface SimpleActionResult {
  error?: string;
}

export async function markAllNotificationsReadAction(): Promise<SimpleActionResult> {
  try {
    await markAllNotificationsRead();
    return {};
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update notifications" };
  }
}

export async function dismissNotificationAction(notificationId: string): Promise<SimpleActionResult> {
  try {
    await dismissNotification(notificationId);
    return {};
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to dismiss the notification" };
  }
}
