/**
 * AiModal.tsx
 *
 * The global "Ask AI" assistant: a centered modal with a conversation list on
 * the left (new/select/delete) and the active thread + composer on the
 * right. Opened from AiAssistantLauncher (header button or ⌘K/Ctrl+K).
 * Answers come from lookups over the agency's own leads/clients/
 * projects/invoices (see ai/service.py::assistant_reply_stream's tool loop),
 * and — when the member allows it — the assistant can also make changes for
 * them, each shown as an AiActionCard under its reply (held for Approve
 * unless they turned confirmations off). The gear in the header opens
 * AiSettingsMenu, the member's own preferences for all of this.
 * A sent message streams the reply in token-by-token via
 * `/api/ai/{agencyId}/{conversationId}/messages/stream` (Server-Sent Events,
 * proxied same-origin — see that route's own docstring for why it's a plain
 * `fetch()` and not this app's usual axios-based `lib/*.ts` helpers) — a
 * "Thinking…" bubble covers the gap before the first token arrives.
 *
 * @module apps/binx-web/src/components/ai/AiModal/AiModal.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus, Sparkles, Trash2, Mic } from "lucide-react";
import { toast } from "sonner";

import {
  createAiConversationAction,
  deleteAiConversationAction,
  getAiConversationMessagesAction,
  getAiPreferencesAction,
  listAiConversationsAction,
  resolveAiActionAction,
  updateAiPreferencesAction,
} from "@/app/(app)/ai/actions";
import type {
  AiAction,
  AiConversation,
  AiMessage,
  AiPreferences,
} from "@/lib/ai";
import AiActionCard from "@/components/ai/AiActionCard/AiActionCard";
import AiMarkdown from "@/components/ai/AiMarkdown/AiMarkdown";
import AiSettingsMenu from "@/components/ai/AiSettingsMenu/AiSettingsMenu";

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
  type: "delta" | "action" | "done" | "error";
  text?: string;
  action?: AiAction;
  message?: string;
}

/** The slice of the Web Speech API the voice composer uses — typed by hand
 * since it's still vendor-prefixed (`webkitSpeechRecognition`) in Chrome and
 * Safari and isn't reliably in TypeScript's DOM lib. */
interface SpeechRecognitionResultLike {
  readonly [index: number]: { transcript: string };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone access is blocked — allow it in your browser to use voice.",
  "service-not-allowed":
    "Microphone access is blocked — allow it in your browser to use voice.",
  "audio-capture": "No microphone was found.",
  "no-speech": "Didn't catch that — try again.",
  network: "Voice input needs a network connection.",
};

interface UseSpeechRecognitionOptions {
  /** Tear down (and discard) any in-progress session while false — e.g.
   * while the modal is closed. */
  enabled: boolean;
  lang?: string;
  /** Called once per session with what was said, after the speaker pauses or
   * stop() is called. Not called for an empty or discarded session. */
  onFinal: (transcript: string) => void;
  onError: (message: string) => void;
}

/** One-utterance-at-a-time speech-to-text: start() listens until the speaker
 * pauses (or stop() is called), streaming the interim transcript meanwhile,
 * then hands the final transcript to onFinal. */
const useSpeechRecognition = ({
  enabled,
  lang = "en-US",
  onFinal,
  onError,
}: UseSpeechRecognitionOptions) => {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Latest callbacks, so a session's onend sees the current render's `send`
  // without re-creating the recognizer on every render.
  const callbacksRef = useRef({ onFinal, onError });
  useEffect(() => {
    callbacksRef.current = { onFinal, onError };
  });

  useEffect(() => {
    if (!enabled) return;
    // Resolved here rather than at module scope: client components are still
    // prerendered on the server, where `window` doesn't exist.
    const speechWindow = window as unknown as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = lang;
    // Non-continuous: the browser ends the session itself once the speaker
    // pauses, which is the cue to send.
    recognition.continuous = false;
    recognition.interimResults = true;

    let latest = "";
    let discarded = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      latest = Array.from(event.results, (result) => result[0].transcript).join(
        "",
      );
      setTranscript(latest);
    };
    recognition.onerror = (event) => {
      // "aborted" is our own teardown below — nothing to tell the user.
      if (event.error === "aborted") return;
      callbacksRef.current.onError(
        SPEECH_ERRORS[event.error] ?? `Voice input failed (${event.error}).`,
      );
    };
    recognition.onend = () => {
      const text = latest.trim();
      latest = "";
      setIsListening(false);
      setTranscript("");
      if (text && !discarded) callbacksRef.current.onFinal(text);
    };

    recognitionRef.current = recognition;
    return () => {
      discarded = true;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [enabled, lang]);

  const start = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      callbacksRef.current.onError(
        "Voice input isn't supported in this browser.",
      );
      return;
    }
    if (isListening) return;
    try {
      recognition.start();
    } catch {
      // InvalidStateError: a double-click landed before onstart fired — the
      // session is already starting.
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { transcript, isListening, start, stop };
};

/** Splits a decoded SSE chunk into whichever complete `data: {...}` events it
 * contains, returning the not-yet-terminated remainder to prepend to the
 * next chunk — a streamed byte chunk can split a "\n\n"-delimited event
 * anywhere, including mid-JSON. */
function splitSseEvents(buffer: string): {
  events: StreamEvent[];
  remainder: string;
} {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events = parts
    .filter((part) => part.startsWith("data: "))
    .map((part) => JSON.parse(part.slice("data: ".length)) as StreamEvent);
  return { events, remainder };
}

const AiModal = ({ agencyId, isOpen, onClose }: AiModalProps) => {
  const [conversations, setConversations] = useState<AiConversation[] | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  // null: no reply in flight. "": in flight, no tokens yet ("Thinking…").
  // Anything else: the reply as streamed in so far.
  const [streamingReply, setStreamingReply] = useState<string | null>(null);
  // Changes the in-flight reply has made/proposed so far — folded into its
  // message once the stream finishes.
  const [streamingActions, setStreamingActions] = useState<AiAction[]>([]);
  const [preferences, setPreferences] = useState<AiPreferences | null>(null);
  const [draft, setDraft] = useState("");
  const router = useRouter();
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

  // The member's own AI preferences, once per open. Failing to load them
  // isn't worth a toast — the gear just stays disabled and the server
  // applies the same defaults either way.
  useEffect(() => {
    if (!isOpen || preferences !== null) return;
    void (async () => {
      const result = await getAiPreferencesAction(agencyId);
      if (result.preferences) setPreferences(result.preferences);
    })();
  }, [isOpen, agencyId, preferences]);

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
  }, [messages, sending, streamingReply, streamingActions]);

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

  const handleDelete = async (
    event: React.MouseEvent,
    conversationId: string,
  ) => {
    event.stopPropagation();
    const result = await deleteAiConversationAction(agencyId, conversationId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setConversations((prev) =>
      (prev ?? []).filter((c) => c.id !== conversationId),
    );
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
      actions: [],
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setDraft("");
    setSending(true);
    setStreamingReply("");
    setStreamingActions([]);

    const isFirstMessage = messages.length === 0;
    const finalize = (finalText: string, actions: AiAction[]) => {
      tempIdRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${tempIdRef.current}`,
          role: "assistant",
          content: finalText,
          created_at: new Date().toISOString(),
          actions,
        },
      ]);
      if (isFirstMessage) {
        setConversations((prev) =>
          (prev ?? []).map((c) =>
            c.id === conversationId
              ? { ...c, title: trimmed.slice(0, 255) }
              : c,
          ),
        );
      }
    };

    try {
      const response = await fetch(
        `/api/ai/${agencyId}/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        },
      );

      if (
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to send that message");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      const actions: AiAction[] = [];
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
          } else if (event.type === "action" && event.action) {
            actions.push(event.action);
            setStreamingActions([...actions]);
          } else if (event.type === "error") {
            streamError = event.message ?? "Unable to send that message";
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }
      finalize(finalText, actions);
      // Changes that already went through (confirmations off) may affect
      // the page behind the modal.
      if (actions.some((action) => action.status === "applied"))
        router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send that message",
      );
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setSending(false);
      setStreamingReply(null);
      setStreamingActions([]);
    }
  };

  const handleResolveAction = async (
    actionId: string,
    decision: "approve" | "decline",
  ) => {
    if (!activeId) return;
    const result = await resolveAiActionAction(
      agencyId,
      activeId,
      actionId,
      decision,
    );
    if (result.error || !result.action) {
      toast.error(result.error ?? "Unable to update that change");
      return;
    }
    const resolved = result.action;
    setMessages((prev) =>
      prev.map((message) =>
        message.actions.some((action) => action.id === actionId)
          ? {
              ...message,
              actions: message.actions.map((action) =>
                action.id === actionId ? resolved : action,
              ),
            }
          : message,
      ),
    );
    if (resolved.status === "applied") router.refresh();
  };

  // Saved optimistically — a failed save rolls the menu back and says so.
  const handlePreferencesChange = async (next: AiPreferences) => {
    const previous = preferences;
    setPreferences(next);
    const result = await updateAiPreferencesAction(agencyId, next);
    if (result.error || !result.preferences) {
      setPreferences(previous);
      toast.error(result.error ?? "Unable to save your AI preferences");
      return;
    }
    setPreferences(result.preferences);
  };

  // Voice input: speak, pause, and the transcript is sent as a message — or,
  // with auto-send turned off, added to the composer to review first.
  const voice = useSpeechRecognition({
    enabled: isOpen,
    onFinal: (transcript) => {
      if (preferences?.voice_auto_send === false) {
        setDraft((prev) => [prev.trim(), transcript].filter(Boolean).join(" "));
      } else {
        void send(transcript);
      }
    },
    onError: (message) => toast.error(message),
  });

  const handleToggleListening = () => {
    if (voice.isListening) {
      // Ends the session early; its onend still sends what was heard.
      voice.stop();
    } else {
      voice.start();
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
            <button
              type="button"
              className={styles.newChat}
              onClick={() => void handleNewChat()}
            >
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
                    <span className={styles.conversationTitle}>
                      {conversation.title ?? "New chat"}
                    </span>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label="Delete conversation"
                      onClick={(event) =>
                        void handleDelete(event, conversation.id)
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.main}>
            <div className={styles.header}>
              <Dialog.Title className={styles.title}>
                <Sparkles className={styles.titleIcon} aria-hidden="true" />
                Ask AI
              </Dialog.Title>
              <AiSettingsMenu
                preferences={preferences}
                onChange={(next) => void handlePreferencesChange(next)}
              />
            </div>
            <Dialog.Description className={styles.description}>
              {preferences?.allow_actions === false
                ? "Answers questions about your leads, clients, projects, and invoices. Changes are turned off — it can only look things up."
                : preferences?.confirm_actions === false
                  ? "Answers questions about your leads, clients, projects, and invoices, and makes changes for you right away."
                  : "Answers questions about your leads, clients, projects, and invoices, and can make changes once you approve them."}
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
                  <div
                    key={message.id}
                    className={styles.bubbleRow}
                    data-role={message.role}
                  >
                    <div className={styles.bubble} data-role={message.role}>
                      {message.role === "assistant" ? (
                        <AiMarkdown content={message.content} />
                      ) : (
                        message.content
                      )}
                    </div>
                    {message.actions.map((action) => (
                      <AiActionCard
                        key={action.id}
                        action={action}
                        onResolve={handleResolveAction}
                      />
                    ))}
                  </div>
                ))
              )}
              {voice.transcript && (
                <div className={styles.bubbleRow} data-role="user">
                  <div
                    className={styles.bubble}
                    data-role="user"
                    data-interim="true"
                  >
                    {voice.transcript}
                  </div>
                </div>
              )}
              {streamingReply !== null && (
                <div className={styles.bubbleRow} data-role="assistant">
                  <div
                    className={styles.bubble}
                    data-role="assistant"
                    data-thinking={streamingReply === "" ? "true" : undefined}
                  >
                    {streamingReply === "" ? (
                      "Thinking…"
                    ) : (
                      <AiMarkdown content={streamingReply} />
                    )}
                  </div>
                  {streamingActions.map((action) => (
                    <AiActionCard
                      key={action.id}
                      action={action}
                      onResolve={handleResolveAction}
                    />
                  ))}
                </div>
              )}
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <input
                type="text"
                className={styles.composerInput}
                placeholder={
                  voice.isListening
                    ? "Listening…"
                    : "Ask about a lead, client, project, or invoice…"
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={sending}
              />
              <button
                type="button"
                className={styles.composerVoice}
                data-listening={voice.isListening ? "true" : undefined}
                aria-pressed={voice.isListening}
                aria-label={
                  voice.isListening ? "Stop and send" : "Ask with your voice"
                }
                onClick={handleToggleListening}
                disabled={sending}
              >
                <Mic aria-hidden="true" />
              </button>
              <button
                type="submit"
                className={styles.composerSubmit}
                disabled={sending || !draft.trim()}
              >
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
