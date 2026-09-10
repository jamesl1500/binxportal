import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  dismissNotification: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import {
  dismissNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import {
  dismissNotificationAction,
  getNotificationsAction,
  getUnreadCountAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

const mockedGet = vi.mocked(getNotifications);
const mockedCount = vi.mocked(getUnreadNotificationCount);
const mockedRead = vi.mocked(markNotificationRead);
const mockedReadAll = vi.mocked(markAllNotificationsRead);
const mockedDismiss = vi.mocked(dismissNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getNotificationsAction", () => {
  it("returns the page on success", async () => {
    const pageData = { items: [], unread_count: 0, has_more: false };
    mockedGet.mockResolvedValueOnce(pageData);
    await expect(getNotificationsAction({ limit: 8 })).resolves.toEqual({ page: pageData });
    expect(mockedGet).toHaveBeenCalledWith({ limit: 8 });
  });

  it("maps an AuthApiError to { error }", async () => {
    mockedGet.mockRejectedValueOnce(new AuthApiError("Not authenticated", 401));
    await expect(getNotificationsAction()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("falls back to a generic message for other errors", async () => {
    mockedGet.mockRejectedValueOnce(new Error("network"));
    await expect(getNotificationsAction()).resolves.toEqual({ error: "Unable to load notifications" });
  });
});

describe("getUnreadCountAction", () => {
  it("passes the number straight through", async () => {
    mockedCount.mockResolvedValueOnce(7);
    await expect(getUnreadCountAction()).resolves.toBe(7);
  });
});

describe("markNotificationReadAction", () => {
  it("returns the updated notification", async () => {
    const note = { id: "n-1" } as never;
    mockedRead.mockResolvedValueOnce(note);
    await expect(markNotificationReadAction("n-1")).resolves.toEqual({ notification: note });
  });

  it("maps an AuthApiError to { error }", async () => {
    mockedRead.mockRejectedValueOnce(new AuthApiError("Notification not found", 404));
    await expect(markNotificationReadAction("n-x")).resolves.toEqual({ error: "Notification not found" });
  });
});

describe("markAllNotificationsReadAction", () => {
  it("returns {} on success", async () => {
    mockedReadAll.mockResolvedValueOnce(undefined);
    await expect(markAllNotificationsReadAction()).resolves.toEqual({});
  });
});

describe("dismissNotificationAction", () => {
  it("returns {} on success", async () => {
    mockedDismiss.mockResolvedValueOnce(undefined);
    await expect(dismissNotificationAction("n-1")).resolves.toEqual({});
    expect(mockedDismiss).toHaveBeenCalledWith("n-1");
  });
});
