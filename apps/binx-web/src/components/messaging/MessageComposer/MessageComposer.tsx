/**
 * MessageComposer.tsx
 *
 * The send box at the bottom of a thread: an auto-growing textarea (Enter to
 * send, Shift+Enter for a newline), an @mention picker (type "@" then a name —
 * arrows to move, Enter/Tab to insert), multi-file attachments with removable
 * previews, and drag-and-drop onto the whole composer. Sends optimistically —
 * the message appears immediately with a pending state, then reconciles with
 * the server's copy (or rolls back with a toast on failure).
 *
 * Mentions are plain "@username" text in the body; binx-api resolves them to
 * the participants they name and sends each one an in-app notification (see
 * messaging/service.py's _notify_mentions).
 *
 * @module apps/binx-web/src/components/messaging/MessageComposer/MessageComposer.tsx
 * @author Binx.io
 */
"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Paperclip, SendHorizontal, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { draftMessageReplyAction, sendMessageAction } from "@/app/(app)/messages/actions";
import type { Message } from "@/lib/messaging-client";
import { MESSAGE_UPLOAD_MAX_BYTES } from "@/lib/messaging-client";
import { useMessagingStore } from "@/stores/use-messaging-store";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";

import styles from "./MessageComposer.module.scss";

interface MessageComposerProps {
  conversationId: string;
}

// The token being typed right before the caret: "@" then an optional handle
// fragment, at a word boundary. Mirrors binx-api's _MENTION_RE character set.
const MENTION_QUERY_RE = /(?:^|\s)@([A-Za-z0-9_.-]*)$/;
const MENTION_LIMIT = 6;

const MessageComposer = ({ conversationId }: MessageComposerProps) => {
  const { agencyId, currentUserId, sendTyping, members } = useMessaging();
  const upsertMessage = useMessagingStore((s) => s.upsertMessage);
  const removeOptimistic = useMessagingStore((s) => s.removeOptimistic);
  const conversationTitle = useMessagingStore(
    (s) => s.conversations.find((c) => c.id === conversationId)?.title ?? "",
  );

  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Null when the mention picker is closed, otherwise the handle fragment
  // typed so far ("" right after the "@").
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const pendingCaretRef = useRef<number | null>(null);
  const optimisticSeqRef = useRef(0);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.user_name.toLowerCase().includes(q) || m.full_name.toLowerCase().includes(q))
      .slice(0, MENTION_LIMIT);
  }, [mentionQuery, members]);

  const mentionOpen = mentionQuery !== null && mentionMatches.length > 0;

  const grow = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  };

  // Restore the caret (and re-grow) after a mention insertion re-renders.
  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && textareaRef.current) {
      const pos = pendingCaretRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      grow(textareaRef.current);
      pendingCaretRef.current = null;
    }
  });

  const refreshMentionContext = (node: HTMLTextAreaElement) => {
    const before = node.value.slice(0, node.selectionStart ?? node.value.length);
    const match = before.match(MENTION_QUERY_RE);
    setMentionQuery(match ? match[1] : null);
    if (match) setMentionIndex(0);
  };

  const insertMention = (userName: string) => {
    const node = textareaRef.current;
    if (!node) return;
    const caret = node.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    const match = before.match(/@([A-Za-z0-9_.-]*)$/);
    if (!match) return;
    const start = before.length - match[0].length;
    const nextBefore = `${before.slice(0, start)}@${userName} `;
    setBody(nextBefore + after);
    pendingCaretRef.current = nextBefore.length;
    setMentionQuery(null);
  };

  const addFiles = (incoming: File[]) => {
    const accepted: File[] = [];
    for (const file of incoming) {
      if (file.size > MESSAGE_UPLOAD_MAX_BYTES) {
        toast.error(`${file.name} is over the ${MESSAGE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB limit`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const handleSend = async () => {
    const text = body.trim();
    if ((!text && files.length === 0) || sending) return;

    const nonce = `${conversationId}-${(optimisticSeqRef.current += 1)}`;
    const sentAt = new Date().toISOString();
    const optimistic: Message = {
      id: `optimistic-${nonce}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      sender_kind: "user",
      sender_name: "You",
      message_type: "user",
      body: text,
      attachments: [],
      edited_at: null,
      deleted_at: null,
      created_at: sentAt,
    };
    upsertMessage(conversationId, optimistic);

    const formData = new FormData();
    formData.append("body", text);
    for (const file of files) formData.append("files", file);

    setBody("");
    setFiles([]);
    setMentionQuery(null);
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const result = await sendMessageAction(agencyId, conversationId, formData);
      removeOptimistic(conversationId, nonce);
      if (result.error) {
        toast.error(result.error);
        setBody(text);
      } else if (result.message) {
        upsertMessage(conversationId, result.message);
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleDraftWithAi = async () => {
    if (drafting) return;
    setDrafting(true);
    try {
      const result = await draftMessageReplyAction(agencyId, conversationId);
      if (result.error || !result.draft) {
        toast.error(result.error ?? "Unable to draft a reply");
        return;
      }
      setBody(result.draft);
      if (textareaRef.current) {
        grow(textareaRef.current);
        textareaRef.current.focus();
      }
    } finally {
      setDrafting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(mentionMatches[mentionIndex].user_name);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(event.target.value);
    grow(event.target);
    refreshMentionContext(event.target);
    const now = Date.now();
    if (now - lastTypingRef.current > 2500) {
      lastTypingRef.current = now;
      sendTyping(conversationId);
    }
  };

  return (
    <div
      className={styles.composer}
      data-dragover={dragOver}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {files.length > 0 && (
        <ul className={styles.attachments}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className={styles.attachment}>
              <span className={styles.attachmentName}>{file.name}</span>
              <button
                type="button"
                className={styles.attachmentRemove}
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.inputRow}>
        {mentionOpen && (
          <ul className={styles.mentionMenu} role="listbox" aria-label="Mention a teammate">
            {mentionMatches.map((member, index) => (
              <li key={member.user_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === mentionIndex}
                  className={styles.mentionOption}
                  data-active={index === mentionIndex}
                  onMouseDown={(event) => {
                    // Keep focus in the textarea so the caret restore works.
                    event.preventDefault();
                    insertMention(member.user_name);
                  }}
                >
                  <span className={styles.mentionName}>{member.full_name}</span>
                  <span className={styles.mentionHandle}>@{member.user_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
        >
          <Paperclip aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.aiDraftButton}
          onClick={() => void handleDraftWithAi()}
          disabled={drafting || sending}
          aria-label="Draft a reply with AI"
          title="Draft a reply with AI"
        >
          <Sparkles aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          rows={1}
          placeholder={conversationTitle ? `Message ${conversationTitle}` : "Write a message"}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={(event) => refreshMentionContext(event.currentTarget)}
          onBlur={() => setMentionQuery(null)}
          aria-label="Message"
        />

        <button
          type="button"
          className={styles.sendButton}
          onClick={() => void handleSend()}
          disabled={sending || (!body.trim() && files.length === 0)}
          aria-label="Send message"
        >
          <SendHorizontal aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default MessageComposer;
