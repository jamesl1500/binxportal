/**
 * PortalMessages.tsx
 *
 * The client portal's two-pane messaging view: the client's threads on the
 * left, the selected thread + a composer on the right. Deliberately lighter
 * than the staff `MessagingInbox` — no websocket, no shared store. It loads
 * on navigation, polls the open thread every 15s, and appends optimistically
 * on send. Staff messages and this client's own messages are distinguished
 * by `sender_kind`.
 *
 * @module apps/binx-web/src/components/portal/PortalMessages/PortalMessages.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import {
  getPortalThreadAction,
  markPortalReadAction,
  sendPortalMessageAction,
} from "@/app/(portal)/portal/messages/actions";
import type { Conversation, Message } from "@/lib/portal";

import styles from "./PortalMessages.module.scss";

interface PortalMessagesProps {
  conversations: Conversation[];
  activeId?: string | null;
  activeTitle?: string | null;
  initialMessages?: Message[];
  currentUserId: string;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  } catch {
    return "";
  }
}

function timestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PortalMessages = ({
  conversations,
  activeId,
  activeTitle,
  initialMessages,
  currentUserId,
}: PortalMessagesProps) => {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reseed when the active thread changes (route navigation swaps the prop).
  const [seededId, setSeededId] = useState<string | undefined>(undefined);
  if (activeId && activeId !== seededId) {
    setSeededId(activeId);
    setMessages(initialMessages ?? []);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!activeId) return;
    void markPortalReadAction(activeId);
    const timer = setInterval(async () => {
      const result = await getPortalThreadAction(activeId);
      if (result.messages) setMessages(result.messages);
    }, 15000);
    return () => clearInterval(timer);
  }, [activeId]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    setBody("");
    const result = await sendPortalMessageAction(activeId, text);
    setSending(false);
    if (result.error) {
      toast.error(result.error);
      setBody(text);
      return;
    }
    if (result.message) setMessages((prev) => [...prev, result.message!]);
    router.refresh();
  };

  return (
    <div className={styles.wrap} data-has-thread={Boolean(activeId)}>
      <aside className={styles.list}>
        <h2 className={styles.listHeading}>Conversations</h2>
        {conversations.length === 0 ? (
          <p className={styles.empty}>No messages yet. Your account team will start a thread here.</p>
        ) : (
          <ul>
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/portal/messages/${conversation.id}`}
                  className={styles.row}
                  data-active={conversation.id === activeId}
                  data-unread={conversation.unread_count > 0}
                >
                  <span className={styles.rowTop}>
                    <span className={styles.rowTitle}>{conversation.title}</span>
                    <span className={styles.rowTime}>{relTime(conversation.last_message_at)}</span>
                  </span>
                  <span className={styles.rowPreview}>
                    {conversation.last_message_preview ?? "No messages yet"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.thread}>
        {!activeId ? (
          <p className={styles.placeholder}>Select a conversation.</p>
        ) : (
          <>
            <header className={styles.threadHeader}>
              <Link href="/portal/messages" className={styles.back}>
                ← Conversations
              </Link>
              <h2 className={styles.threadTitle}>{activeTitle}</h2>
            </header>

            <div className={styles.messages}>
              {messages.length === 0 ? (
                <p className={styles.placeholder}>No messages yet — say hello.</p>
              ) : (
                messages.map((message) => {
                  const mine = message.sender_id === currentUserId;
                  return (
                    <div key={message.id} className={styles.message} data-mine={mine}>
                      <div className={styles.messageMeta}>
                        <span className={styles.sender}>
                          {mine ? "You" : message.sender_name}
                          {message.sender_kind === "client" && !mine && (
                            <span className={styles.clientTag}>Client</span>
                          )}
                        </span>
                        <span className={styles.time}>{timestamp(message.created_at)}</span>
                      </div>
                      {message.deleted_at ? (
                        <p className={styles.deleted}>Message deleted</p>
                      ) : (
                        <p className={styles.body}>{message.body}</p>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <textarea
                className={styles.input}
                rows={2}
                placeholder="Write a message…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button type="submit" className={styles.send} disabled={sending || !body.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

export default PortalMessages;
