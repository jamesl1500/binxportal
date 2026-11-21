/**
 * MessageComposer.tsx
 *
 * The send box at the bottom of a thread: an auto-growing textarea (Enter to
 * send, Shift+Enter for a newline), the shared @mention picker
 * (ui/MentionTextarea — the same one the team timeline uses), multi-file
 * attachments with removable
 * previews, and drag-and-drop onto the whole composer. Sends optimistically —
 * the message appears immediately with a pending state, then reconciles with
 * the server's copy (or rolls back with a toast on failure).
 *
 * Mentions are plain "@username" text in the body; binx-api resolves them to
 * the participants they name and sends each one an in-app notification (see
 * messaging/service.py's _notify_mentions).
 *
 * @module apps/binx-web/src/components/messaging/MessageComposer/MessageComposer.tsx
 * @author Binx Portal
 */
"use client";

import { useRef, useState } from "react";
import { Paperclip, SendHorizontal, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  draftMessageReplyAction,
  sendMessageAction,
} from "@/app/(app)/messages/actions";
import type { Message } from "@/lib/messaging-client";
import { MESSAGE_UPLOAD_MAX_BYTES } from "@/lib/messaging-client";
import { useMessagingStore } from "@/stores/use-messaging-store";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";
import MentionTextarea from "@/components/ui/MentionTextarea/MentionTextarea";

import styles from "./MessageComposer.module.scss";

interface MessageComposerProps {
  conversationId: string;
}

const COMPOSER_MAX_HEIGHT_PX = 160;

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const optimisticSeqRef = useRef(0);

  const addFiles = (incoming: File[]) => {
    const accepted: File[] = [];
    for (const file of incoming) {
      if (file.size > MESSAGE_UPLOAD_MAX_BYTES) {
        toast.error(
          `${file.name} is over the ${MESSAGE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB limit`,
        );
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
    setSending(true);
    try {
      const result = await sendMessageAction(
        agencyId,
        conversationId,
        formData,
      );
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
      textareaRef.current?.focus();
    } finally {
      setDrafting(false);
    }
  };

  const handleChange = (value: string) => {
    setBody(value);
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
                onClick={() =>
                  setFiles((prev) => prev.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${file.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.inputRow}>
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

        <MentionTextarea
          ref={textareaRef}
          className={styles.inputWrap}
          textareaClassName={styles.textarea}
          value={body}
          onChange={handleChange}
          members={members}
          onSubmit={() => void handleSend()}
          submitOn="enter"
          menuPlacement="above"
          minRows={1}
          maxHeight={COMPOSER_MAX_HEIGHT_PX}
          placeholder={
            conversationTitle
              ? `Message ${conversationTitle}`
              : "Write a message"
          }
          ariaLabel="Message"
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
