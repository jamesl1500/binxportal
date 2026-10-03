import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ai/actions", () => ({
  createAiConversationAction: vi.fn(),
  deleteAiConversationAction: vi.fn(),
  getAiConversationMessagesAction: vi.fn(),
  getAiPreferencesAction: vi.fn(),
  listAiConversationsAction: vi.fn(),
  resolveAiActionAction: vi.fn(),
  updateAiPreferencesAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  createAiConversationAction,
  deleteAiConversationAction,
  getAiConversationMessagesAction,
  getAiPreferencesAction,
  listAiConversationsAction,
  resolveAiActionAction,
  updateAiPreferencesAction,
} from "@/app/(app)/ai/actions";
import type { AiAction, AiPreferences } from "@/lib/ai";
import { toast } from "sonner";

import AiModal from "./AiModal";

const mockedList = vi.mocked(listAiConversationsAction);
const mockedCreate = vi.mocked(createAiConversationAction);
const mockedMessages = vi.mocked(getAiConversationMessagesAction);
const mockedDelete = vi.mocked(deleteAiConversationAction);
const mockedGetPreferences = vi.mocked(getAiPreferencesAction);
const mockedUpdatePreferences = vi.mocked(updateAiPreferencesAction);
const mockedResolve = vi.mocked(resolveAiActionAction);

const DEFAULT_PREFERENCES: AiPreferences = {
  response_length: "balanced",
  tone: "professional",
  allow_actions: true,
  confirm_actions: true,
  voice_auto_send: true,
  custom_instructions: null,
};

const PENDING_ACTION: AiAction = {
  id: "act-1",
  tool: "update_lead_status",
  summary: 'Move the lead "Acme Co" from new to won',
  status: "pending",
  result: null,
  created_at: "2026-01-03T00:00:00Z",
};

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
  mockedGetPreferences.mockResolvedValue({ preferences: DEFAULT_PREFERENCES });
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
        { id: "m1", role: "user", content: "Any overdue invoices?", created_at: "2026-01-02T00:00:00Z", actions: [] },
        {
          id: "m2",
          role: "assistant",
          content: "You have none.",
          created_at: "2026-01-02T00:00:01Z",
          actions: [],
        },
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

  describe("changes the assistant makes", () => {
    it("shows a streamed proposal as a card, and approving it applies it and refreshes the page", async () => {
      mockedCreate.mockResolvedValueOnce({
        conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
      });
      const deferred = deferredSseStream();
      vi.mocked(fetch).mockResolvedValueOnce(sseResponse(deferred.stream));
      mockedResolve.mockResolvedValueOnce({ action: { ...PENDING_ACTION, status: "applied", result: "Moved." } });

      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
      await user.click(await screen.findByRole("button", { name: "Which invoices are overdue?" }));

      // The card shows up mid-stream, as soon as the proposal is made.
      deferred.push({ type: "action", action: PENDING_ACTION } as never);
      expect(await screen.findByText(PENDING_ACTION.summary)).toBeInTheDocument();

      deferred.push({ type: "delta", text: "I've proposed marking Acme Co as won." });
      deferred.push({ type: "done" });
      deferred.close();
      await screen.findByText("I've proposed marking Acme Co as won.");

      await user.click(screen.getByRole("button", { name: "Approve" }));

      expect(mockedResolve).toHaveBeenCalledWith(agencyId, "new-1", "act-1", "approve");
      expect(await screen.findByText("Done")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
      expect(refresh).toHaveBeenCalled();
    });

    it("declines a proposal loaded with the thread", async () => {
      mockedList.mockResolvedValue({
        conversations: [{ id: "c1", title: "Acme", created_at: "2026-01-02T00:00:00Z", updated_at: null }],
      });
      mockedMessages.mockResolvedValue({
        messages: [
          { id: "m1", role: "user", content: "Acme won", created_at: "2026-01-02T00:00:00Z", actions: [] },
          {
            id: "m2",
            role: "assistant",
            content: "Proposed.",
            created_at: "2026-01-02T00:00:01Z",
            actions: [PENDING_ACTION],
          },
        ],
      });
      mockedResolve.mockResolvedValueOnce({ action: { ...PENDING_ACTION, status: "declined" } });

      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
      await user.click(await screen.findByRole("button", { name: "Decline" }));

      expect(mockedResolve).toHaveBeenCalledWith(agencyId, "c1", "act-1", "decline");
      expect(await screen.findByText("Declined")).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe("settings", () => {
    it("saves a change straight away and reflects it in the header copy", async () => {
      mockedUpdatePreferences.mockImplementation(async (_agencyId, preferences) => ({ preferences }));

      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
      expect(await screen.findByText(/can make changes once you approve them/)).toBeInTheDocument();

      await user.click(await screen.findByRole("button", { name: "AI settings" }));
      await user.click(await screen.findByRole("switch", { name: "Let AI make changes" }));

      expect(mockedUpdatePreferences).toHaveBeenCalledWith(agencyId, { ...DEFAULT_PREFERENCES, allow_actions: false });
      expect(await screen.findByText(/Changes are turned off/)).toBeInTheDocument();
    });

    it("rolls back and toasts when a save fails", async () => {
      mockedUpdatePreferences.mockResolvedValueOnce({ error: "Unable to save your AI preferences" });

      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
      await user.click(await screen.findByRole("button", { name: "AI settings" }));
      await user.click(await screen.findByRole("radio", { name: "Concise" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unable to save your AI preferences"));
      expect(screen.getByRole("radio", { name: "Balanced" })).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("voice input", () => {
    /** Stands in for the browser's SpeechRecognition; tests drive its event
     * handlers by hand, the way the browser would. */
    class FakeRecognition {
      static instances: FakeRecognition[] = [];
      lang = "";
      continuous = true;
      interimResults = false;
      onstart: (() => void) | null = null;
      onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn(() => this.onstart?.());
      stop = vi.fn(() => this.onend?.());
      abort = vi.fn();
      constructor() {
        FakeRecognition.instances.push(this);
      }
    }

    const latest = () => FakeRecognition.instances.at(-1)!;

    beforeEach(() => {
      FakeRecognition.instances = [];
      vi.stubGlobal("SpeechRecognition", FakeRecognition);
    });

    it("animates while listening, shows the live transcript, and sends it once the speaker pauses", async () => {
      mockedCreate.mockResolvedValueOnce({
        conversation: { id: "new-1", title: null, created_at: "2026-01-03T00:00:00Z", updated_at: null },
      });
      const deferred = deferredSseStream();
      vi.mocked(fetch).mockResolvedValueOnce(sseResponse(deferred.stream));

      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

      await user.click(await screen.findByRole("button", { name: "Ask with your voice" }));
      const micButton = screen.getByRole("button", { name: "Stop and send" });
      expect(micButton).toHaveAttribute("aria-pressed", "true");
      expect(micButton).toHaveAttribute("data-listening", "true");
      expect(latest().continuous).toBe(false);

      act(() => latest().onresult!({ results: [[{ transcript: "Any overdue" }]] }));
      expect(screen.getByText("Any overdue")).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();

      // The browser ends a non-continuous session on its own after a pause.
      act(() => latest().onresult!({ results: [[{ transcript: "Any overdue invoices?" }]] }));
      act(() => latest().onend!());

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          "/api/ai/a1/new-1/messages/stream",
          expect.objectContaining({ body: JSON.stringify({ message: "Any overdue invoices?" }) }),
        ),
      );
      expect(screen.getByRole("button", { name: "Ask with your voice" })).not.toHaveAttribute("data-listening");
    });

    it("puts the transcript in the composer instead when auto-send is off", async () => {
      mockedGetPreferences.mockResolvedValue({ preferences: { ...DEFAULT_PREFERENCES, voice_auto_send: false } });
      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);
      // Wait for preferences to land before speaking.
      await screen.findByText(/can make changes once you approve them/);

      await user.click(await screen.findByRole("button", { name: "Ask with your voice" }));
      act(() => latest().onresult!({ results: [[{ transcript: "Any overdue invoices?" }]] }));
      act(() => latest().onend!());

      expect(screen.getByRole("textbox")).toHaveValue("Any overdue invoices?");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sends nothing when nothing was heard", async () => {
      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

      await user.click(await screen.findByRole("button", { name: "Ask with your voice" }));
      await user.click(screen.getByRole("button", { name: "Stop and send" }));

      expect(fetch).not.toHaveBeenCalled();
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it("toasts a readable error when the microphone is blocked", async () => {
      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

      await user.click(await screen.findByRole("button", { name: "Ask with your voice" }));
      act(() => {
        latest().onerror!({ error: "not-allowed" });
        latest().onend!();
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Microphone access is blocked — allow it in your browser to use voice.",
      );
    });

    it("toasts when the browser has no speech recognition", async () => {
      vi.stubGlobal("SpeechRecognition", undefined);
      const user = userEvent.setup();
      render(<AiModal agencyId={agencyId} isOpen onClose={vi.fn()} />);

      await user.click(await screen.findByRole("button", { name: "Ask with your voice" }));

      expect(toast.error).toHaveBeenCalledWith("Voice input isn't supported in this browser.");
    });
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
