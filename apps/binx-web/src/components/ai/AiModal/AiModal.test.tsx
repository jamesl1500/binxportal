import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ai/actions", () => ({
  createAiConversationAction: vi.fn(),
  deleteAiConversationAction: vi.fn(),
  getAiConversationMessagesAction: vi.fn(),
  listAiConversationsAction: vi.fn(),
  sendAiMessageAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  createAiConversationAction,
  deleteAiConversationAction,
  getAiConversationMessagesAction,
  listAiConversationsAction,
  sendAiMessageAction,
} from "@/app/(app)/ai/actions";

import AiModal from "./AiModal";

const mockedList = vi.mocked(listAiConversationsAction);
const mockedCreate = vi.mocked(createAiConversationAction);
const mockedMessages = vi.mocked(getAiConversationMessagesAction);
const mockedSend = vi.mocked(sendAiMessageAction);
const mockedDelete = vi.mocked(deleteAiConversationAction);

const agencyId = "a1";

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ conversations: [] });
});

describe("AiModal", () => {
  it("renders nothing until opened", () => {
    render(<AiModal agencyId={agencyId} isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Ask AI" })).not.toBeInTheDocument();
  });

  it("loads the conversation list and shows an empty state", async () => {
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Ask AI" })).toBeInTheDocument();
    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith(agencyId);
  });

  it("lands on the most recent conversation and loads its messages", async () => {
    mockedList.mockResolvedValue({
      conversations: [
        { id: "c1", title: "Overdue invoices?", created_at: "2026-01-02T00:00:00Z", updated_at: null },
      ],
    });
    mockedMessages.mockResolvedValue({
      messages: [
        { id: "m1", role: "user", content: "Any overdue invoices?", created_at: "2026-01-02T00:00:00Z" },
        { id: "m2", role: "assistant", content: "You have none.", created_at: "2026-01-02T00:00:01Z" },
      ],
    });

    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

    expect(await screen.findByText("Any overdue invoices?")).toBeInTheDocument();
    expect(await screen.findByText("You have none.")).toBeInTheDocument();
    expect(mockedMessages).toHaveBeenCalledWith(agencyId, "c1");
  });

  it("sends a suggestion, lazily creates a conversation, shows Thinking…, then the reply", async () => {
    mockedCreate.mockResolvedValueOnce({
      conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
    });
    let resolveSend: (value: Awaited<ReturnType<typeof sendAiMessageAction>>) => void = () => {};
    mockedSend.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Which invoices are overdue?" }));

    expect(await screen.findByText("Which invoices are overdue?")).toBeInTheDocument();
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith(agencyId);

    resolveSend({
      message: { id: "m2", role: "assistant", content: "You have 2 overdue invoices.", created_at: "2026-01-03T00:00:01Z" },
    });

    expect(await screen.findByText("You have 2 overdue invoices.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Thinking…")).not.toBeInTheDocument());
    expect(mockedSend).toHaveBeenCalledWith(agencyId, "new-1", "Which invoices are overdue?");
  });

  it("starts a new chat and deletes a conversation", async () => {
    mockedList.mockResolvedValue({
      conversations: [{ id: "c1", title: "Old thread", created_at: "2026-01-01T00:00:00Z", updated_at: null }],
    });
    mockedMessages.mockResolvedValue({ messages: [] });
    mockedCreate.mockResolvedValueOnce({
      conversation: { id: "c2", title: null, created_at: "2026-01-04T00:00:00Z", updated_at: null },
    });
    mockedDelete.mockResolvedValueOnce({});

    const user = userEvent.setup();
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

    const oldThreadText = await screen.findByText("Old thread");
    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(mockedCreate).toHaveBeenCalledWith(agencyId);

    const oldThreadRow = oldThreadText.closest('[role="button"]') as HTMLElement;
    await user.click(within(oldThreadRow).getByRole("button", { name: "Delete conversation" }));
    await waitFor(() => expect(screen.queryByText("Old thread")).not.toBeInTheDocument());
    expect(mockedDelete).toHaveBeenCalledWith(agencyId, "c1");
  });
});
