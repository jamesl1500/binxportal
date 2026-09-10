import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  dismissNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

const page = {
  items: [
    {
      id: "n-1",
      agency_id: "a-1",
      category: "team",
      event_type: "invite_accepted",
      title: "Someone joined",
      body: null,
      link: "/team",
      actor_name: "Ada",
      read_at: null,
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  unread_count: 1,
  has_more: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("getNotifications", () => {
  it("passes pagination + unread_only params with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: page });

    await expect(getNotifications({ unreadOnly: true, limit: 10, offset: 20 })).resolves.toEqual(page);
    expect(mockedApi.get).toHaveBeenCalledWith("/notifications", {
      headers: { Authorization: "Bearer tok" },
      params: { unread_only: true, limit: 10, offset: 20 },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getNotifications()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

describe("getUnreadNotificationCount", () => {
  it("returns the count", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { unread_count: 4 } });
    await expect(getUnreadNotificationCount()).resolves.toBe(4);
  });

  it("swallows errors and returns 0 — the badge must never break the shell", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(500, "boom"));
    await expect(getUnreadNotificationCount()).resolves.toBe(0);
  });
});

describe("markNotificationRead", () => {
  it("POSTs to the read endpoint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { ...page.items[0], read_at: "2026-09-01T01:00:00Z" } });
    await markNotificationRead("n-1");
    expect(mockedApi.post).toHaveBeenCalledWith("/notifications/n-1/read", null, {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("surfaces binx-api's error detail", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(404, "Notification not found"));
    await expect(markNotificationRead("n-x")).rejects.toEqual(new AuthApiError("Notification not found", 404));
  });
});

describe("markAllNotificationsRead", () => {
  it("POSTs to read-all", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { unread_count: 0 } });
    await markAllNotificationsRead();
    expect(mockedApi.post).toHaveBeenCalledWith("/notifications/read-all", null, {
      headers: { Authorization: "Bearer tok" },
    });
  });
});

describe("dismissNotification", () => {
  it("DELETEs the notification", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: undefined });
    await dismissNotification("n-1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/notifications/n-1", {
      headers: { Authorization: "Bearer tok" },
    });
  });
});
