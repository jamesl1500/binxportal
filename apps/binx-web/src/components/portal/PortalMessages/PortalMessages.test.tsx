import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(portal)/portal/messages/actions", () => ({
  getPortalThreadAction: vi.fn().mockResolvedValue({ messages: [] }),
  markPortalReadAction: vi.fn().mockResolvedValue(undefined),
  sendPortalMessageAction: vi.fn(),
}));

import { sendPortalMessageAction } from "@/app/(portal)/portal/messages/actions";
import PortalMessages from "./PortalMessages";

const send = vi.mocked(sendPortalMessageAction);

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
