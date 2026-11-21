import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/timeline", () => ({
  createTimelinePost: vi.fn(),
  createTimelineComment: vi.fn(),
  getTimelinePost: vi.fn(),
  getTimelineFeed: vi.fn(),
  updateTimelinePost: vi.fn(),
  deleteTimelinePost: vi.fn(),
  setTimelinePostPinned: vi.fn(),
  setTimelineReaction: vi.fn(),
  getTimelineComments: vi.fn(),
  updateTimelineComment: vi.fn(),
  deleteTimelineComment: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import { createTimelineComment, createTimelinePost, getTimelinePost } from "@/lib/timeline";

import { createTimelineCommentAction, createTimelinePostAction } from "./actions";

beforeEach(() => vi.clearAllMocks());

describe("timeline actions", () => {
  it("returns binx-api's message when a call is refused", async () => {
    vi.mocked(createTimelinePost).mockRejectedValue(
      new AuthApiError("Only owners and admins can post announcements", 403),
    );
    expect(await createTimelinePostAction("a1", "Hi", true)).toEqual({
      ok: false,
      error: "Only owners and admins can post announcements",
    });
  });

  it("falls back to a generic message for unexpected errors", async () => {
    vi.mocked(createTimelinePost).mockRejectedValue(new Error("socket hang up"));
    expect(await createTimelinePostAction("a1", "Hi", false)).toEqual({ ok: false, error: "Unable to post" });
  });

  it("re-reads the post after commenting so its count is current", async () => {
    vi.mocked(createTimelineComment).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(getTimelinePost).mockResolvedValue({ id: "p1", comment_count: 1 } as never);
    const result = await createTimelineCommentAction("a1", "p1", "Nice");
    expect(result).toEqual({ ok: true, data: { comment: { id: "c1" }, post: { id: "p1", comment_count: 1 } } });
    expect(getTimelinePost).toHaveBeenCalledWith("a1", "p1");
  });
});
