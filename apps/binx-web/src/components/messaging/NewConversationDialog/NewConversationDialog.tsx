/**
 * NewConversationDialog.tsx
 *
 * The "New message" button and the modal it opens: pick one or more
 * teammates (one → a direct message, several → a group), optionally link the
 * thread to a client, optionally name the group, and optionally send a first
 * message.
 *
 * @module apps/binx-web/src/components/messaging/NewConversationDialog/NewConversationDialog.tsx
 * @author Binx.io
 */
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createConversationAction } from "@/app/(app)/messages/actions";
import { useMessagingStore } from "@/stores/use-messaging-store";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";
import MemberMultiSelect from "@/components/messaging/MemberMultiSelect/MemberMultiSelect";
import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./NewConversationDialog.module.scss";

const NewConversationDialog = () => {
  const router = useRouter();
  const { agencyId, members, clients, refreshConversations } = useMessaging();
  const upsertConversation = useMessagingStore((s) => s.upsertConversation);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const isGroup = selected.size > 1;

  const reset = () => {
    setSelected(new Set());
    setTitle("");
    setClientId("");
    setFirstMessage("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const result = await createConversationAction(agencyId, {
        kind: isGroup ? "group" : "direct",
        title: isGroup ? title.trim() || null : null,
        participantUserIds: [...selected],
        clientId: clientId || null,
        projectId: null,
        initialMessage: firstMessage.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.conversation) {
        upsertConversation(result.conversation);
        void refreshConversations();
        setOpen(false);
        reset();
        router.push(`/messages/${result.conversation.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" ref={triggerRef} className={styles.trigger} onClick={() => setOpen(true)}>
        <Plus className={styles.plusIcon} aria-hidden="true" />
        New message
      </button>

      <PageCoachmark
        id="messages-new"
        anchorRef={triggerRef}
        title="Start a conversation"
        body="Message a teammate or a client without leaving the app."
      />

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Start a conversation">
            <Dialog.Title className={styles.dialogTitle}>New message</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Pick one teammate for a direct message, or several for a group.
            </Dialog.Description>

            <form className={styles.form} onSubmit={handleSubmit}>
              <MemberMultiSelect members={members} selected={selected} onChange={setSelected} />

              {isGroup && (
                <label className={styles.field}>
                  <span className={styles.label}>Group name (optional)</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Launch planning"
                    maxLength={255}
                  />
                </label>
              )}

              {clients.length > 0 && (
                <label className={styles.field}>
                  <span className={styles.label}>Link to a client (optional)</span>
                  <select
                    className={styles.input}
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                  >
                    <option value="">No client</option>
                    {clients
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles.label}>First message (optional)</span>
                <textarea
                  className={styles.textarea}
                  value={firstMessage}
                  onChange={(event) => setFirstMessage(event.target.value)}
                  rows={2}
                  maxLength={8192}
                />
              </label>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submit} disabled={selected.size === 0 || submitting}>
                  {submitting ? "Starting…" : "Start conversation"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default NewConversationDialog;
