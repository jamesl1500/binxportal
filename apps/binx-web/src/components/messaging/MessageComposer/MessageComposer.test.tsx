import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTyping = vi.fn();

let mockMembers: Array<{ user_id: string; user_name: string; full_name: string }> = [];

vi.mock("@/app/(app)/messages/actions", () => ({
  sendMessageAction: vi.fn(),
  draftMessageReplyAction: vi.fn(),
}));

vi.mock("@/components/messaging/MessagingProvider/MessagingProvider", () => ({
  useMessaging: () => ({
    agencyId: "a1",
    currentUserId: "me",
    members: mockMembers,
    refreshConversations: vi.fn(),
    sendTyping,
    socketStatus: "open",
  }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

import { draftMessageReplyAction, sendMessageAction } from "@/app/(app)/messages/actions";
import { useMessagingStore } from "@/stores/use-messaging-store";

import MessageComposer from "./MessageComposer";

const mockedSend = vi.mocked(sendMessageAction);
const mockedDraft = vi.mocked(draftMessageReplyAction);

beforeEach(() => {
  vi.clearAllMocks();
  mockMembers = [];
  useMessagingStore.setState({
    currentUserId: "me",
    conversations: [
      {
        id: "c1",
        agency_id: "a1",
        kind: "direct",
        title: "Bob",
        client_id: null,
        client_name: null,
        project_id: null,
        project_name: null,
        participant_names: ["Bob"],
        participant_count: 2,
        is_muted: false,
        unread_count: 0,
        last_message_preview: null,
        last_message_at: null,
        created_at: "2026-08-01T00:00:00Z",
      },
    ],
    messagesByConversation: {},
    hydrated: new Set(),
    typingByConversation: {},
  });
});

describe("MessageComposer", () => {
  it("sends on Enter and keeps a newline on Shift+Enter", async () => {
    mockedSend.mockResolvedValue({ message: undefined });
    const user = userEvent.setup();
    render(<MessageComposer conversationId="c1" />);

    const box = screen.getByLabelText("Message");
    await user.type(box, "first line{Shift>}{Enter}{/Shift}second line");
    expect(mockedSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("first line\nsecond line");

    await user.type(box, "{Enter}");
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0]).toBe("a1");
    expect(mockedSend.mock.calls[0][1]).toBe("c1");
  });

  it("opens the @mention picker and inserts the picked handle, not a send", async () => {
    mockMembers = [
      { user_id: "u1", user_name: "priya-amara", full_name: "Priya Amara" },
      { user_id: "u2", user_name: "marcus-webb", full_name: "Marcus Webb" },
    ];
    mockedSend.mockResolvedValue({ message: undefined });
    const user = userEvent.setup();
    render(<MessageComposer conversationId="c1" />);

    const box = screen.getByLabelText("Message");
    await user.type(box, "hey @pri");

    const option = await screen.findByRole("option", { name: /Priya Amara/ });
    expect(option).toBeInTheDocument();

    await user.type(box, "{Enter}");
    expect(mockedSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("hey @priya-amara ");

    await user.type(box, "{Enter}");
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it("rejects a file over the size limit with a toast", async () => {
    const user = userEvent.setup();
    const { container } = render(<MessageComposer conversationId="c1" />);

    const huge = new File(["x".repeat(10)], "big.bin");
    Object.defineProperty(huge, "size", { value: 30 * 1024 * 1024 });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, huge);

    expect(toastError).toHaveBeenCalled();
    expect(screen.queryByText("big.bin")).not.toBeInTheDocument();
  });

  it("fills the composer with an AI-drafted reply", async () => {
    mockedDraft.mockResolvedValue({ draft: "Thanks for reaching out, here's an update..." });
    const user = userEvent.setup();
    render(<MessageComposer conversationId="c1" />);

    const button = screen.getByLabelText("Draft a reply with AI");
    await user.click(button);

    expect(mockedDraft).toHaveBeenCalledWith("a1", "c1");
    const box = screen.getByLabelText("Message");
    expect(box).toHaveValue("Thanks for reaching out, here's an update...");
  });

  it("toasts and leaves the composer untouched when drafting fails", async () => {
    mockedDraft.mockResolvedValue({ error: "Unable to draft a reply" });
    const user = userEvent.setup();
    render(<MessageComposer conversationId="c1" />);

    const button = screen.getByLabelText("Draft a reply with AI");
    await user.click(button);

    expect(toastError).toHaveBeenCalledWith("Unable to draft a reply");
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("disables the AI draft button while sending", async () => {
    mockedSend.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<MessageComposer conversationId="c1" />);

    await user.type(screen.getByLabelText("Message"), "hello{Enter}");

    expect(screen.getByLabelText("Draft a reply with AI")).toBeDisabled();
  });
});
