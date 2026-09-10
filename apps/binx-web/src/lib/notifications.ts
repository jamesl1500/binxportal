/**
 * notifications.ts
 *
 * Server-only helpers for authenticated calls to binx-api's `/notifications/*`
 * endpoints — the dropdown in the header and the full `/notifications` page.
 * Notifications are per-user and span every agency the person belongs to, so
 * (unlike `lib/messaging.ts`) none of these take an agency id.
 *
 * @module apps/binx-web/src/lib/notifications.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { NotificationCategory } from "@/lib/notifications-client";

export type { NotificationCategory } from "@/lib/notifications-client";
export { NOTIFICATION_CATEGORY_META } from "@/lib/notifications-client";

export interface AppNotification {
  id: string;
  agency_id: string | null;
  category: NotificationCategory;
  event_type: string;
  title: string;
  body: string | null;
  /** A frontend-relative path to open when the row is clicked. */
  link: string | null;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  items: AppNotification[];
  unread_count: number;
  has_more: boolean;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

export interface NotificationQuery {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * getNotifications
 *
 * A page of the signed-in user's notifications, newest first, via
 * `GET /notifications`. Carries the current unread count and a `has_more`
 * flag for offset pagination.
 *
 * @function getNotifications
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function getNotifications(query: NotificationQuery = {}): Promise<NotificationPage> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<NotificationPage>("/notifications", {
      headers,
      params: {
        unread_only: query.unreadOnly || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load notifications");
  }
}

/**
 * getUnreadNotificationCount
 *
 * The unread badge number, via `GET /notifications/unread-count`. Swallows
 * errors and returns 0 — a broken badge must never break the app shell.
 *
 * @function getUnreadNotificationCount
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const headers = await authHeader();
    const { data } = await api.get<{ unread_count: number }>("/notifications/unread-count", { headers });
    return data.unread_count;
  } catch {
    return 0;
  }
}

/**
 * markNotificationRead
 *
 * Marks one notification read via `POST /notifications/{id}/read`.
 *
 * @function markNotificationRead
 * @throws {AuthApiError} - Thrown if not authenticated, or the notification isn't the caller's.
 */
export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<AppNotification>(`/notifications/${notificationId}/read`, null, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update the notification");
  }
}

/**
 * markAllNotificationsRead
 *
 * Marks every unread notification read via `POST /notifications/read-all`.
 *
 * @function markAllNotificationsRead
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const headers = await authHeader();

  try {
    await api.post("/notifications/read-all", null, { headers });
  } catch (error) {
    throw apiError(error, "Unable to update notifications");
  }
}

/**
 * dismissNotification
 *
 * Permanently removes one notification via `DELETE /notifications/{id}`.
 *
 * @function dismissNotification
 * @throws {AuthApiError} - Thrown if not authenticated, or the notification isn't the caller's.
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete(`/notifications/${notificationId}`, { headers });
  } catch (error) {
    throw apiError(error, "Unable to dismiss the notification");
  }
}
