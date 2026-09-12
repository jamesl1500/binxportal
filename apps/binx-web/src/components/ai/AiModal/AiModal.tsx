/**
 * AiModal.tsx
 *
 * The global "Ask AI" assistant: a centered modal with a conversation list on
 * the left (new/select/delete) and the active thread + composer on the
 * right. Opened from AiAssistantLauncher (header button or ⌘K/Ctrl+K).
 * Answers are read-only lookups over the agency's own leads/clients/
 * projects/invoices (see ai/service.py::assistant_reply_stream's tool loop).
 * A sent message streams the reply in token-by-token via
 * `/api/ai/{agencyId}/{conversationId}/messages/stream` (Server-Sent Events,
 * proxied same-origin — see that route's own docstring for why it's a plain
 * `fetch()` and not this app's usual axios-based `lib/*.ts` helpers) — a
 * "Thinking…" bubble covers the gap before the first token arrives.
 *
 * @module apps/binx-web/src/components/ai/AiModal/AiModal.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createAiConversationAction,
  deleteAiConversationAction,
  getAiConversationMessagesAction,
  listAiConversationsAction,
} from "@/app/(app)/ai/actions";
import type { AiConversation, AiMessage } from "@/lib/ai";
import AiMarkdown from "@/components/ai/AiMarkdown/AiMarkdown";

import styles from "./AiModal.module.scss";

interface AiModalProps {
  agencyId: string;
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  "Which invoices are overdue?",
  "What leads are we sitting on?",
  "Summarize our active projects.",
];

interface StreamEvent {
  type: "delta" | "done" | "error";
  text?: string;
  message?: string;
}

/** Splits a decoded SSE chunk into whichever complete `data: {...}` events it
 * contains, returning the not-yet-terminated remainder to prepend to the
 * next chunk — a streamed byte chunk can split a "\n\n"-delimited event
 * anywhere, including mid-JSON. */
function splitSseEvents(buffer: string): { events: StreamEvent[]; remainder: string } {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events = parts
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.slice("data: ".length)) as StreamEvent);
  return { events, remainder };
}

const AiModal = ({ agencyId, isOpen, onClose }: AiModalProps) => {
  const [conversations, setConversations] = useState<AiConversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // null: no reply in flight. "": in flight, no tokens yet ("Thinking…").
  // Anything else: the reply as streamed in so far.
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const tempIdRef = useRef(0);
  // Conversation ids created client-side this session — their message list is
  // already known (empty, or already updated optimistically), so the
  // activeId-effect below skips re-fetching it from the server once.
  const freshIds = useRef<Set<string>>(new Set());

  // Load the conversation list once per open, and land on the most recent thread.
  useEffect(() => {
    if (!isOpen || conversations !== null) return;
    void (async () => {
      const result = await listAiConversationsAction(agencyId);
      if (result.error) {
        toast.error(result.error);
        setConversations([]);
        return;
      }
      const list = result.conversations ?? [];
      setConversations(list);
      if (list.length > 0) setActiveId(list[0].id);
    })();
  }, [isOpen, agencyId, conversations]);

  // Load a thread's messages whenever the selection changes. Nothing to fetch
  // when there's no active thread — the call sites that clear `activeId`
  // (handleDelete, closing the modal) clear `messages` themselves. Nothing to
  // fetch either for a conversation this session just created — its
  // (possibly optimistically-updated) `messages` state is already correct.
  useEffect(() => {
    if (!activeId) return;
    if (freshIds.current.has(activeId)) {
      freshIds.current.delete(activeId);
      return;
    }
    void (async () => {
      setMessagesLoading(true);
      const result = await getAiConversationMessagesAction(agencyId, activeId);
      setMessagesLoading(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setMessages(result.messages ?? []);
    })();
  }, [activeId, agencyId]);

  useEffect(() => {
    const el = scrollRef.current;
    // jsdom (tests) doesn't implement scrollTo — guard rather than crash.
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending, streamingReply]);

  const handleNewChat = async () => {
    const result = await createAiConversationAction(agencyId);
    if (result.error || !result.conversation) {
      toast.error(result.error ?? "Unable to start a new conversation");
      return;
    }
    freshIds.current.add(result.conversation.id);
    setConversations((prev) => [result.conversation!, ...(prev ?? [])]);
    setActiveId(result.conversation.id);
    setMessages([]);
  };

  const handleDelete = async (event: React.MouseEvent, conversationId: string) => {
    event.stopPropagation();
    const result = await deleteAiConversationAction(agencyId, conversationId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setConversations((prev) => (prev ?? []).filter((c) => c.id !== conversationId));
    if (activeId === conversationId) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      const created = await createAiConversationAction(agencyId);
      if (created.error || !created.conversation) {
        toast.error(created.error ?? "Unable to start a new conversation");
        return;
      }
      conversationId = created.conversation.id;
      freshIds.current.add(conversationId);
      setConversations((prev) => [created.conversation!, ...(prev ?? [])]);
      setActiveId(conversationId);
    }

    tempIdRef.current += 1;
    const optimisticUser: AiMessage = {
      id: `pending-${tempIdRef.current}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setDraft("");
    setSending(true);
    setStreamingReply("");

    const isFirstMessage = messages.length === 0;
    const finalize = (finalText: string) => {
      tempIdRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${tempIdRef.current}`,
          role: "assistant",
          content: finalText,
          created_at: new Date().toISOString(),
        },
      ]);
      if (isFirstMessage) {
        setConversations((prev) =>
          (prev ?? []).map((c) => (c.id === conversationId ? { ...c, title: trimmed.slice(0, 255) } : c)),
        );
      }
    };

    try {
      const response = await fetch(`/api/ai/${agencyId}/${conversationId}/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to send that message");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = splitSseEvents(buffer);
        buffer = remainder;
        for (const event of events) {
          if (event.type === "delta" && event.text) {
            finalText += event.text;
            setStreamingReply(finalText);
          } else if (event.type === "error") {
            streamError = event.message ?? "Unable to send that message";
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }
      finalize(finalText);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send that message");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setSending(false);
      setStreamingReply(null);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Ask AI">
          <div className={styles.sidebar}>
            <button type="button" className={styles.newChat} onClick={() => void handleNewChat()}>
              <Plus className={styles.newChatIcon} aria-hidden="true" />
              New chat
            </button>
            <div className={styles.conversationList}>
              {conversations === null ? (
                <p className={styles.sidebarEmpty}>Loading…</p>
              ) : conversations.length === 0 ? (
                <p className={styles.sidebarEmpty}>No conversations yet.</p>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    className={styles.conversationRow}
                    data-active={conversation.id === activeId}
                    aria-label={`Open "${conversation.title ?? "New chat"}"`}
                    onClick={() => setActiveId(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveId(conversation.id);
                      }
                    }}
                  >
                    <span className={styles.conversationTitle}>{conversation.title ?? "New chat"}</span>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label="Delete conversation"
                      onClick={(event) => void handleDelete(event, conversation.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.main}>
            <Dialog.Title className={styles.title}>
              <Sparkles className={styles.titleIcon} aria-hidden="true" />
              Ask AI
            </Dialog.Title>
            <Dialog.Description className={styles.description}>
              Answers questions about your leads, clients, projects, and invoices. Read-only — it can&apos;t change
              anything.
            </Dialog.Description>

            <div className={styles.thread} ref={scrollRef}>
              {messagesLoading ? (
                <p className={styles.threadEmpty}>Loading…</p>
              ) : messages.length === 0 ? (
                <div className={styles.threadEmpty}>
                  <p>Ask anything about your agency&apos;s data.</p>
                  <div className={styles.suggestions}>
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        type="button"
                        key={suggestion}
                        className={styles.suggestion}
                        onClick={() => void send(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={styles.bubbleRow} data-role={message.role}>
                    <div className={styles.bubble} data-role={message.role}>
                      {message.role === "assistant" ? (
                        <AiMarkdown content={message.content} />
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))
              )}
              {streamingReply !== null && (
                <div className={styles.bubbleRow} data-role="assistant">
                  <div className={styles.bubble} data-role="assistant" data-thinking={streamingReply === "" ? "true" : undefined}>
                    {streamingReply === "" ? "Thinking…" : <AiMarkdown content={streamingReply} />}
                  </div>
                </div>
              )}
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <input
                type="text"
                className={styles.composerInput}
                placeholder="Ask about a lead, client, project, or invoice…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={sending}
              />
              <button type="submit" className={styles.composerSubmit} disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default AiModal;
