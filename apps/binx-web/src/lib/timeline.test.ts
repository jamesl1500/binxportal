import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  createTimelineComment,
  createTimelinePost,
  deleteTimelineComment,
  deleteTimelinePost,
  getTimelineComments,
  getTimelineFeed,
  getTimelinePost,
  setTimelinePostPinned,
  setTimelineReaction,
  updateTimelineComment,
  updateTimelinePost,
} from "@/lib/timeline";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);
const AUTH = { headers: { Authorization: "Bearer token" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
  for (const method of ["get", "post", "patch", "put", "delete"] as const) {
    mockedApi[method].mockResolvedValue({ data: { ok: method } });
  }
});

describe("timeline API wrappers", () => {
  it("reads the feed, with the cursor only when there is one", async () => {
    await expect(getTimelineFeed("a1")).resolves.toEqual({ ok: "get" });
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/timeline", { ...AUTH, params: undefined });

    await getTimelineFeed("a1", "c-xyz");
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/timeline", { ...AUTH, params: { cursor: "c-xyz" } });
  });

  it("creates, edits, pins and deletes posts", async () => {
    await createTimelinePost("a1", "Hello", true);
    expect(mockedApi.post).toHaveBeenLastCalledWith(
      "/agencies/a1/timeline/posts",
      { body: "Hello", is_announcement: true },
      AUTH,
    );

    await updateTimelinePost("a1", "p1", "Edited");
    expect(mockedApi.patch).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1", { body: "Edited" }, AUTH);

    await setTimelinePostPinned("a1", "p1", true);
    expect(mockedApi.put).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1/pin", { pinned: true }, AUTH);

    await expect(deleteTimelinePost("a1", "p1")).resolves.toBeUndefined();
    expect(mockedApi.delete).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1", AUTH);

    await getTimelinePost("a1", "p1");
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1", AUTH);
  });

  it("adds a reaction with PUT and removes it with DELETE", async () => {
    await setTimelineReaction("a1", "p1", "celebrate", true);
    expect(mockedApi.put).toHaveBeenLastCalledWith(
      "/agencies/a1/timeline/posts/p1/reactions/celebrate",
      undefined,
      AUTH,
    );
    await setTimelineReaction("a1", "p1", "celebrate", false);
    expect(mockedApi.delete).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1/reactions/celebrate", AUTH);
  });

  it("lists, creates, edits and deletes comments", async () => {
    await getTimelineComments("a1", "p1");
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1/comments", AUTH);

    await createTimelineComment("a1", "p1", "Nice");
    expect(mockedApi.post).toHaveBeenLastCalledWith("/agencies/a1/timeline/posts/p1/comments", { body: "Nice" }, AUTH);

    await updateTimelineComment("a1", "c1", "Nicer");
    expect(mockedApi.patch).toHaveBeenLastCalledWith("/agencies/a1/timeline/comments/c1", { body: "Nicer" }, AUTH);

    await deleteTimelineComment("a1", "c1");
    expect(mockedApi.delete).toHaveBeenLastCalledWith("/agencies/a1/timeline/comments/c1", AUTH);
  });

  it("escapes ids in paths", async () => {
    await getTimelinePost("a1", "../x");
    expect(mockedApi.get.mock.calls.at(-1)?.[0]).not.toContain("../");
  });

  it("turns an API error into an AuthApiError with binx-api's message", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(403, "Only owners and admins can post announcements"));
    const error = await createTimelinePost("a1", "Hi", true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthApiError);
    expect(error).toMatchObject({ message: "Only owners and admins can post announcements", status: 403 });
  });

  it("falls back to a friendly message, and passes non-HTTP errors through", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(500, undefined));
    await expect(deleteTimelineComment("a1", "c1")).rejects.toMatchObject({
      message: "Unable to delete the comment",
      status: 500,
    });

    const boom = new Error("network down");
    mockedApi.get.mockRejectedValueOnce(boom);
    await expect(getTimelineFeed("a1")).rejects.toBe(boom);
  });

  it("requires a session", async () => {
    mockedGetAccessToken.mockResolvedValue(undefined);
    await expect(getTimelineFeed("a1")).rejects.toMatchObject({ status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});
