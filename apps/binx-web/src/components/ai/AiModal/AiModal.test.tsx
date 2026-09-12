import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ai/actions", () => ({
  createAiConversationAction: vi.fn(),
  deleteAiConversationAction: vi.fn(),
  getAiConversationMessagesAction: vi.fn(),
  listAiConversationsAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  createAiConversationAction,
  deleteAiConversationAction,
  getAiConversationMessagesAction,
  listAiConversationsAction,
} from "@/app/(app)/ai/actions";
import { toast } from "sonner";

import AiModal from "./AiModal";

const mockedList = vi.mocked(listAiConversationsAction);
const mockedCreate = vi.mocked(createAiConversationAction);
const mockedMessages = vi.mocked(getAiConversationMessagesAction);
const mockedDelete = vi.mocked(deleteAiConversationAction);

const agencyId = "a1";

/** A controllable fake SSE stream — push events on demand, close when done,
 * mirroring how the real backend's assistant_reply_stream generator yields
 * chunks over time rather than all at once. */
function deferredSseStream() {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    stream,
    push(event: { type: string; text?: string; message?: string }) {
      controllerRef!.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close() {
      controllerRef!.close();
    },
  };
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ conversations: [] });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("sends a suggestion, lazily creates a conversation, shows Thinking…, streams in the reply, then finalizes", async () => {
    mockedCreate.mockResolvedValueOnce({
      conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
    });
    const deferred = deferredSseStream();
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(sseResponse(deferred.stream));

    const user = userEvent.setup();
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Which invoices are overdue?" }));

    expect(await screen.findByText("Which invoices are overdue?")).toBeInTheDocument();
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith(agencyId);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/ai/a1/new-1/messages/stream",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ message: "Which invoices are overdue?" }) }),
    );

    // First chunk arrives — the "Thinking…" placeholder is replaced by the
    // growing reply, rendered incrementally, not all at once.
    deferred.push({ type: "delta", text: "You have " });
    expect(await screen.findByText("You have", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();

    deferred.push({ type: "delta", text: "2 overdue invoices." });
    deferred.push({ type: "done" });
    deferred.close();

    expect(await screen.findByText("You have 2 overdue invoices.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Thinking…")).not.toBeInTheDocument());
  });

  it("toasts an error and removes the optimistic message when the stream reports one", async () => {
    mockedCreate.mockResolvedValueOnce({
      conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
    });
    const deferred = deferredSseStream();
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(sseResponse(deferred.stream));

    const user = userEvent.setup();
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Which invoices are overdue?" }));
    expect(await screen.findByText("Which invoices are overdue?")).toBeInTheDocument();

    deferred.push({ type: "error", message: "AI isn't configured for this agency yet." });
    deferred.close();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("AI isn't configured for this agency yet."));
    // The optimistic user bubble was rolled back — back to the empty state,
    // not just "no longer 'Thinking…'". (The suggestion button carries the
    // same text, so re-querying for it isn't a useful assertion here.)
    expect(await screen.findByText("Ask anything about your agency's data.")).toBeInTheDocument();
  });

  it("toasts a generic error when the response isn't a stream", async () => {
    mockedCreate.mockResolvedValueOnce({
      conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
    });
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const user = userEvent.setup();
    render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Which invoices are overdue?" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not authenticated"));
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
