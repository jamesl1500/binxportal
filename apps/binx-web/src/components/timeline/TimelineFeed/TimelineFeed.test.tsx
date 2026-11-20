import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/dashboard/timeline/actions", () => ({
  createTimelinePostAction: vi.fn(),
  loadTimelinePageAction: vi.fn(),
  updateTimelinePostAction: vi.fn(),
  deleteTimelinePostAction: vi.fn(),
  pinTimelinePostAction: vi.fn(),
  reactToTimelinePostAction: vi.fn(),
  loadTimelineCommentsAction: vi.fn(),
  createTimelineCommentAction: vi.fn(),
  updateTimelineCommentAction: vi.fn(),
  deleteTimelineCommentAction: vi.fn(),
}));

import {
  createTimelineCommentAction,
  createTimelinePostAction,
  deleteTimelinePostAction,
  loadTimelinePageAction,
  pinTimelinePostAction,
  reactToTimelinePostAction,
} from "@/app/(app)/dashboard/timeline/actions";
import { mentionSegments, type TimelineFeed as Feed, type TimelinePost } from "@/lib/timeline-client";

import TimelineFeed from "./TimelineFeed";

const members = [
  { user_name: "bob", full_name: "Bob Member" },
  { user_name: "cara", full_name: "Cara Admin" },
];

function post(overrides: Partial<TimelinePost> = {}): TimelinePost {
  return {
    id: "p1",
    author: { user_id: "u1", name: "Alice Owner", member_id: "m1", has_avatar: false, avatar_version: null, role: "owner" },
    body: "Hello team",
    is_announcement: false,
    pinned: false,
    created_at: "2026-11-20T10:00:00Z",
    edited_at: null,
    reactions: [],
    comment_count: 0,
    recent_comments: [],
    can_edit: true,
    can_delete: true,
    can_pin: false,
    ...overrides,
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  return { pinned: [], posts: [post()], next_cursor: null, can_moderate: false, ...overrides };
}

beforeEach(() => vi.clearAllMocks());

describe("mentionSegments", () => {
  it("highlights only handles of real teammates", () => {
    expect(mentionSegments("hi @bob and @nobody!", new Set(["bob"]))).toEqual([
      { text: "hi ", mention: false },
      { text: "@bob", mention: true },
      { text: " and @nobody!", mention: false },
    ]);
  });
});

describe("TimelineFeed", () => {
  it("posts and puts the new post on top", async () => {
    vi.mocked(createTimelinePostAction).mockResolvedValue({ ok: true, data: post({ id: "p2", body: "Shipped it" }) });
    render(<TimelineFeed agencyId="a1" initialFeed={feed()} members={members} />);

    await userEvent.type(screen.getByLabelText("New timeline post"), "Shipped it");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(createTimelinePostAction).toHaveBeenCalledWith("a1", "Shipped it", false);
    const bodies = await screen.findAllByRole("article");
    expect(within(bodies[0]).getByText("Shipped it")).toBeInTheDocument();
    expect(screen.getByLabelText("New timeline post")).toHaveValue("");
  });

  it("only offers announcements to moderators", () => {
    const { rerender } = render(<TimelineFeed agencyId="a1" initialFeed={feed()} members={members} />);
    expect(screen.queryByLabelText(/Announcement/)).not.toBeInTheDocument();
    rerender(<TimelineFeed key="mod" agencyId="a1" initialFeed={feed({ can_moderate: true })} members={members} />);
    expect(screen.getByLabelText(/Announcement/)).toBeInTheDocument();
  });

  it("loads more posts with the cursor", async () => {
    vi.mocked(loadTimelinePageAction).mockResolvedValue({
      ok: true,
      data: feed({ posts: [post({ id: "p0", body: "Older" })], next_cursor: null }),
    });
    render(<TimelineFeed agencyId="a1" initialFeed={feed({ next_cursor: "c1" })} members={members} />);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadTimelinePageAction).toHaveBeenCalledWith("a1", "c1");
    expect(await screen.findByText("Older")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("moves a post into Pinned when it's pinned", async () => {
    vi.mocked(pinTimelinePostAction).mockResolvedValue({ ok: true, data: post({ pinned: true, can_pin: true }) });
    render(<TimelineFeed agencyId="a1" initialFeed={feed({ posts: [post({ can_pin: true })] })} members={members} />);
    await userEvent.click(screen.getByRole("button", { name: "Pin" }));
    const pinned = await screen.findByRole("region", { name: "Pinned" });
    expect(within(pinned).getByText("Hello team")).toBeInTheDocument();
  });

  it("asks before deleting, then removes the post", async () => {
    vi.mocked(deleteTimelinePostAction).mockResolvedValue({ ok: true, data: true });
    render(<TimelineFeed agencyId="a1" initialFeed={feed()} members={members} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Hello team")).not.toBeInTheDocument());
  });

  it("toggles a like and shows the updated reaction count", async () => {
    vi.mocked(reactToTimelinePostAction).mockResolvedValue({
      ok: true,
      data: post({ reactions: [{ reaction: "like", count: 1, reacted: true, names: ["Me"] }] }),
    });
    render(<TimelineFeed agencyId="a1" initialFeed={feed()} members={members} />);
    await userEvent.click(screen.getByRole("button", { name: "Like" }));
    expect(reactToTimelinePostAction).toHaveBeenCalledWith("a1", "p1", "like", true);
    expect(await screen.findByRole("button", { name: /Like — remove yours/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides edit and delete when the viewer can't use them", () => {
    render(
      <TimelineFeed agencyId="a1" initialFeed={feed({ posts: [post({ can_edit: false, can_delete: false })] })} members={members} />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("comments and picks a mention from the picker", async () => {
    vi.mocked(createTimelineCommentAction).mockResolvedValue({
      ok: true,
      data: {
        comment: {
          id: "c1",
          post_id: "p1",
          author: post().author,
          body: "@bob nice",
          created_at: "2026-11-20T10:05:00Z",
          edited_at: null,
          can_edit: true,
          can_delete: true,
        },
        post: post({ comment_count: 1 }),
      },
    });
    render(<TimelineFeed agencyId="a1" initialFeed={feed()} members={members} />);
    const box = screen.getByLabelText("Comment on Alice Owner's post");
    await userEvent.type(box, "@bo");
    await userEvent.click(screen.getByRole("option", { name: /Bob Member/ }));
    await userEvent.type(box, "nice");
    expect(box).toHaveValue("@bob nice");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(createTimelineCommentAction).toHaveBeenCalledWith("a1", "p1", "@bob nice");
  });
});
