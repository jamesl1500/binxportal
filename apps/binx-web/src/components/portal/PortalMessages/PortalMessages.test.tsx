import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(portal)/portal/messages/actions", () => ({
  getPortalThreadAction: vi.fn().mockResolvedValue({ messages: [] }),
  markPortalReadAction: vi.fn().mockResolvedValue(undefined),
  sendPortalMessageAction: vi.fn(),
}));

import {
  getPortalThreadAction,
  markPortalReadAction,
  sendPortalMessageAction,
} from "@/app/(portal)/portal/messages/actions";
import PortalMessages, { POLL_MS } from "./PortalMessages";

const send = vi.mocked(sendPortalMessageAction);
const poll = vi.mocked(getPortalThreadAction);
const markRead = vi.mocked(markPortalReadAction);

const conversations = [
  {
    id: "c1",
    title: "Fjord & Field ↔ Northlight",
    last_message_at: "2026-01-01T00:00:00Z",
    last_message_preview: "Hi there",
    unread_count: 0,
  },
] as never;

const messages = [
  {
    id: "m1",
    sender_id: "staff-1",
    sender_name: "Morgan",
    sender_kind: "agency",
    body: "Concepts are in the canvas.",
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  },
] as never;

beforeEach(() => vi.clearAllMocks());

describe("PortalMessages", () => {
  it("lists conversations and prompts to pick one when none is active", () => {
    render(<PortalMessages conversations={conversations} currentUserId="me" />);
    expect(screen.getByText("Fjord & Field ↔ Northlight")).toBeInTheDocument();
    expect(screen.getByText("Select a conversation.")).toBeInTheDocument();
  });

  it("shows the empty state when the client has no threads", () => {
    render(<PortalMessages conversations={[]} currentUserId="me" />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders the open thread's messages and a composer", () => {
    render(
      <PortalMessages
        conversations={conversations}
        activeId="c1"
        activeTitle="Fjord & Field ↔ Northlight"
        initialMessages={messages}
        currentUserId="me"
      />,
    );
    expect(screen.getByText("Concepts are in the canvas.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write a message…")).toBeInTheDocument();
  });

  it("shows who the client is talking to, with avatars", () => {
    const participants = [
      { user_id: "staff-1", full_name: "Morgan Lee", job_title: "Designer", has_avatar: true, avatar_version: "v1" },
      { user_id: "staff-2", full_name: "Riley Park", job_title: null, has_avatar: false, avatar_version: null },
      { user_id: "me", full_name: "Casey Client", job_title: null, has_avatar: false, avatar_version: null },
    ] as never;
    const { container } = render(
      <PortalMessages
        conversations={conversations}
        activeId="c1"
        activeTitle="Thread"
        initialMessages={messages}
        participants={participants}
        currentUserId="me"
      />,
    );
    const header = container.querySelector("header")!;
    expect(header).toHaveTextContent("With Morgan Lee · Designer, Riley Park");
    expect(header).not.toHaveTextContent("Casey Client");
    expect(header.querySelector("img")).toHaveAttribute(
      "src",
      "/api/portal/conversations/c1/participants/staff-1/avatar?v=v1",
    );
    expect(screen.getByText("RP")).toBeInTheDocument();

    // Morgan's message carries their photo too.
    const bubble = screen.getByText("Concepts are in the canvas.").closest("[data-mine]")!;
    expect(bubble.querySelector("img")).toHaveAttribute(
      "src",
      "/api/portal/conversations/c1/participants/staff-1/avatar?v=v1",
    );
  });

  it("optimistically appends a sent message", async () => {
    send.mockResolvedValueOnce({
      message: { id: "m2", sender_id: "me", sender_name: "You", body: "Looks good", created_at: "2026-01-02T00:00:00Z" },
    } as never);
    render(
      <PortalMessages
        conversations={conversations}
        activeId="c1"
        activeTitle="Thread"
        initialMessages={[]}
        currentUserId="me"
      />,
    );
    await userEvent.type(screen.getByPlaceholderText("Write a message…"), "Looks good");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(send).toHaveBeenCalledWith("c1", "Looks good");
    expect(await screen.findByText("Looks good")).toBeInTheDocument();
  });
});

describe("PortalMessages polling", () => {
  let visibility: DocumentVisibilityState = "visible";
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const reply = {
    id: "m2",
    sender_id: "staff-1",
    sender_name: "Morgan",
    sender_kind: "agency",
    body: "Round two is up.",
    created_at: "2026-01-01T00:05:00Z",
    deleted_at: null,
  };

  const open = (activeId = "c1", list = conversations) =>
    render(
      <PortalMessages
        conversations={list}
        activeId={activeId}
        activeTitle="Thread"
        initialMessages={messages}
        currentUserId="me"
      />,
    );

  it("shows new replies and marks them read, since they were seen arriving", async () => {
    poll.mockResolvedValue({ messages: [...(messages as never[]), reply] } as never);
    open();
    expect(markRead).toHaveBeenCalledWith("c1", { refresh: false });
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByText("Round two is up.")).toBeInTheDocument();
    expect(markRead).toHaveBeenLastCalledWith("c1");
  });

  it("doesn't poll a hidden tab, and catches up when it's shown again", async () => {
    poll.mockResolvedValue({ messages: [...(messages as never[]), reply] } as never);
    open();
    visibility = "hidden";
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 4));
    expect(poll).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(poll).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Round two is up.")).toBeInTheDocument();
  });

  it("drops a reply for a thread the client has already left", async () => {
    let resolve: (value: unknown) => void = () => {};
    poll.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never);
    const view = open("c1");
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    view.rerender(
      <PortalMessages
        conversations={conversations}
        activeId="c2"
        activeTitle="Other thread"
        initialMessages={[]}
        currentUserId="me"
      />,
    );
    await act(async () => resolve({ messages: [reply] }));
    expect(screen.queryByText("Round two is up.")).not.toBeInTheDocument();
  });

  it("refreshes the page when the thread opened had unread messages", () => {
    const [first] = conversations as unknown as Record<string, unknown>[];
    open("c1", [{ ...first, unread_count: 2 }] as never);
    expect(markRead).toHaveBeenCalledWith("c1", { refresh: true });
  });
});
