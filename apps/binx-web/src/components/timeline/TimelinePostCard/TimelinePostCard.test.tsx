import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }));
vi.mock("@/app/(app)/dashboard/timeline/actions", () => ({
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
  deleteTimelineCommentAction,
  deleteTimelinePostAction,
  loadTimelineCommentsAction,
  pinTimelinePostAction,
  reactToTimelinePostAction,
  updateTimelineCommentAction,
  updateTimelinePostAction,
} from "@/app/(app)/dashboard/timeline/actions";
import type { TimelineComment, TimelinePost } from "@/lib/timeline-client";

import TimelinePostCard from "./TimelinePostCard";

const members = [{ user_name: "bob", full_name: "Bob Member" }];

const author = { user_id: "u1", name: "Alice Owner", member_id: "m1", has_avatar: false, avatar_version: null, role: "owner" };

function comment(overrides: Partial<TimelineComment> = {}): TimelineComment {
  return {
    id: "c1",
    post_id: "p1",
    author: { ...author, user_id: "u2", name: "Bob Member", member_id: "m2", role: "member" },
    body: "First!",
    created_at: "2026-11-20T10:05:00Z",
    edited_at: null,
    can_edit: true,
    can_delete: true,
    ...overrides,
  };
}

function post(overrides: Partial<TimelinePost> = {}): TimelinePost {
  return {
    id: "p1",
    author,
    body: "Hello @bob and @nobody",
    is_announcement: false,
    pinned: false,
    created_at: "2026-11-20T10:00:00Z",
    edited_at: null,
    reactions: [],
    comment_count: 0,
    recent_comments: [],
    can_edit: true,
    can_delete: true,
    can_pin: true,
    ...overrides,
  };
}

function renderCard(initial: TimelinePost = post()) {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <TimelinePostCard agencyId="a1" post={initial} members={members} onChange={onChange} onDelete={onDelete} />,
  );
  const rerender = (next: TimelinePost) =>
    utils.rerender(
      <TimelinePostCard agencyId="a1" post={next} members={members} onChange={onChange} onDelete={onDelete} />,
    );
  return { onChange, onDelete, rerender };
}

beforeEach(() => vi.clearAllMocks());

describe("TimelinePostCard", () => {
  it("shows the author, role, badges, an edited marker and highlights real mentions only", () => {
    renderCard(
      post({
        is_announcement: true,
        pinned: true,
        edited_at: "2026-11-20T11:00:00Z",
        author: { ...author, has_avatar: true, avatar_version: "v2" },
      }),
    );
    const card = screen.getByRole("article");
    expect(within(card).getByText("Alice Owner")).toBeInTheDocument();
    expect(within(card).getByText("Owner")).toBeInTheDocument();
    expect(within(card).getByText("Announcement")).toBeInTheDocument();
    expect(within(card).getByText("Pinned")).toBeInTheDocument();
    expect(within(card).getByTitle("Edited")).toBeInTheDocument();
    expect(within(card).getByText("@bob").tagName).toBe("SPAN");
    expect(within(card).queryByText("@nobody")).not.toBeInTheDocument(); // plain text, not its own element
    expect(within(card).getByRole("button", { name: "Unpin" })).toBeInTheDocument();
  });

  it("edits the post, and Cancel leaves it unchanged", async () => {
    vi.mocked(updateTimelinePostAction).mockResolvedValue({ ok: true, data: post({ body: "Updated" }) });
    const { onChange } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Edit your post")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit your post");
    await userEvent.clear(box);
    await userEvent.type(box, "Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTimelinePostAction).toHaveBeenCalledWith("a1", "p1", "Updated");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ body: "Updated" })));
    expect(screen.queryByLabelText("Edit your post")).not.toBeInTheDocument();
  });

  it("keeps the editor open and toasts when saving fails", async () => {
    vi.mocked(updateTimelinePostAction).mockResolvedValue({ ok: false, error: "Too long" });
    const { onChange } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Too long"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Edit your post")).toBeInTheDocument();
  });

  it("pins, and reports a failed pin", async () => {
    vi.mocked(pinTimelinePostAction)
      .mockResolvedValueOnce({ ok: true, data: post({ pinned: true }) })
      .mockResolvedValueOnce({ ok: false, error: "Only owners and admins can pin" });
    const { onChange } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(pinTimelinePostAction).toHaveBeenCalledWith("a1", "p1", true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pinned: true })));

    await userEvent.click(screen.getByRole("button", { name: "Pin" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only owners and admins can pin"));
  });

  it("doesn't delete when the confirm is cancelled; deletes when it's confirmed", async () => {
    vi.mocked(deleteTimelinePostAction).mockResolvedValue({ ok: true, data: true });
    const { onDelete } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(deleteTimelinePostAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("p1"));
  });

  it("toggles reactions from a chip and from the picker", async () => {
    vi.mocked(reactToTimelinePostAction).mockResolvedValue({ ok: true, data: post() });
    renderCard(post({ reactions: [{ reaction: "love", count: 2, reacted: true, names: ["Me", "Bob"] }] }));

    await userEvent.click(screen.getByRole("button", { name: /Love — remove yours/ }));
    expect(reactToTimelinePostAction).toHaveBeenLastCalledWith("a1", "p1", "love", false);

    await userEvent.click(screen.getByRole("button", { name: "React" }));
    const picker = screen.getByRole("group", { name: "Pick a reaction" });
    expect(within(picker).getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(picker).getByRole("button", { name: "Celebrate" }));
    expect(reactToTimelinePostAction).toHaveBeenLastCalledWith("a1", "p1", "celebrate", true);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Pick a reaction" })).not.toBeInTheDocument());
  });

  it("loads earlier comments, then appends a new one to the full list", async () => {
    const older = comment({ id: "c0", body: "Older one" });
    const latest = comment();
    const added = comment({ id: "c2", body: "Third" });
    vi.mocked(loadTimelineCommentsAction).mockResolvedValue({ ok: true, data: [older, latest] });
    vi.mocked(createTimelineCommentAction).mockResolvedValue({
      ok: true,
      data: { comment: added, post: post({ comment_count: 3, recent_comments: [latest, added] }) },
    });
    const { onChange } = renderCard(post({ comment_count: 2, recent_comments: [latest] }));

    await userEvent.click(screen.getByRole("button", { name: "View 1 earlier comment" }));
    expect(await screen.findByText("Older one")).toBeInTheDocument();

    // "Comment" focuses the comment box.
    await userEvent.click(screen.getByRole("button", { name: /Comment/ }));
    const box = screen.getByLabelText("Comment on Alice Owner's post");
    expect(box).toHaveFocus();
    await userEvent.type(box, "Third");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect(createTimelineCommentAction).toHaveBeenCalledWith("a1", "p1", "Third");
    expect(await screen.findByText("Third")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ comment_count: 3 }));
    expect(box).toHaveValue("");
  });

  it("toasts when earlier comments can't load or a comment can't be posted", async () => {
    vi.mocked(loadTimelineCommentsAction).mockResolvedValue({ ok: false, error: "Unable to load comments" });
    vi.mocked(createTimelineCommentAction).mockResolvedValue({ ok: false, error: "Unable to comment" });
    renderCard(post({ comment_count: 4, recent_comments: [comment()] }));

    await userEvent.click(screen.getByRole("button", { name: "View 3 earlier comments" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Unable to load comments"));

    await userEvent.type(screen.getByLabelText("Comment on Alice Owner's post"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Reply" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Unable to comment"));
    expect(screen.getByLabelText("Comment on Alice Owner's post")).toHaveValue("Hi");
  });

  it("edits a comment in place, and Cancel closes the editor", async () => {
    vi.mocked(updateTimelineCommentAction).mockResolvedValue({ ok: true, data: comment({ body: "Edited!" }) });
    const { onChange } = renderCard(post({ comment_count: 1, recent_comments: [comment()] }));
    const comments = screen.getByRole("region", { name: "Comments" });

    await userEvent.click(within(comments).getByRole("button", { name: "Edit" }));
    await userEvent.click(within(comments).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Edit your comment")).not.toBeInTheDocument();

    await userEvent.click(within(comments).getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit your comment");
    await userEvent.clear(box);
    await userEvent.type(box, "Edited!");
    await userEvent.click(within(comments).getByRole("button", { name: "Save" }));

    expect(updateTimelineCommentAction).toHaveBeenCalledWith("a1", "c1", "Edited!");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ recent_comments: [expect.objectContaining({ body: "Edited!" })] }),
      ),
    );
  });

  it("deletes a comment after confirming, including from the loaded full list", async () => {
    vi.mocked(loadTimelineCommentsAction).mockResolvedValue({
      ok: true,
      data: [comment({ id: "c0", body: "Older one" }), comment()],
    });
    vi.mocked(deleteTimelineCommentAction).mockResolvedValue({
      ok: true,
      data: post({ comment_count: 1, recent_comments: [comment()] }),
    });
    const { onChange } = renderCard(post({ comment_count: 2, recent_comments: [comment()] }));
    await userEvent.click(screen.getByRole("button", { name: "View 1 earlier comment" }));
    await screen.findByText("Older one");

    const comments = screen.getByRole("region", { name: "Comments" });
    const olderRow = within(comments).getByText("Older one").closest("li") as HTMLElement;
    await userEvent.click(within(olderRow).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteTimelineCommentAction).toHaveBeenCalledWith("a1", "p1", "c0");
    await waitFor(() => expect(screen.queryByText("Older one")).not.toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ comment_count: 1 }));
  });

  it("hides comment tools you can't use", () => {
    renderCard(post({ comment_count: 1, recent_comments: [comment({ can_edit: false, can_delete: false })] }));
    const comments = screen.getByRole("region", { name: "Comments" });
    expect(within(comments).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(comments).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
