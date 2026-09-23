/**
 * MessageThread.tsx
 *
 * The right pane of the inbox: the header (participant avatars, title,
 * participants, settings menu), the scrollable message history (day
 * dividers, sender avatars with consecutive-sender grouping, system notices,
 * edited/deleted states, attachments, a typing indicator), and the composer. History is loaded once per conversation and
 * kept live by the store; "Load earlier" pages backwards.
 *
 * @module apps/binx-web/src/components/messaging/MessageThread/MessageThread.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { format, isSameDay } from "date-fns";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { AgencyMember } from "@/lib/agencies";
import type { ConversationDetail, Message } from "@/lib/messaging-client";
import {
  addParticipantsAction,
  deleteMessageAction,
  editMessageAction,
  loadMessagesAction,
  markReadAction,
  removeParticipantAction,
  renameConversationAction,
  toggleMuteAction,
} from "@/app/(app)/messages/actions";
import { useMessagingStore } from "@/stores/use-messaging-store";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";
import MemberMultiSelect from "@/components/messaging/MemberMultiSelect/MemberMultiSelect";
import MessageAvatar from "@/components/messaging/MessageAvatar/MessageAvatar";
import MessageAttachmentView from "@/components/messaging/MessageAttachmentView/MessageAttachmentView";
import MessageComposer from "@/components/messaging/MessageComposer/MessageComposer";

import styles from "./MessageThread.module.scss";

const PAGE_SIZE = 50;
// How many faces the header stack shows before collapsing into "+N".
const HEADER_AVATARS = 4;

// Matches an @handle the same way binx-api's _MENTION_RE does, so what we
// highlight is exactly what the server turns into a notification.
const MENTION_RE = /(?<![\w@])@([A-Za-z0-9_.-]{2,255})/g;

/** Renders a message body with known @mentions wrapped in a highlight span. */
function renderBody(body: string, handles: Set<string>): React.ReactNode {
  if (!handles.size || !body.includes("@")) return body;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = match[1].toLowerCase();
    if (!handles.has(handle)) continue;
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push(body.slice(lastIndex, start));
    parts.push(
      <span key={start} className={styles.mention}>
        {match[0]}
      </span>,
    );
    lastIndex = start + match[0].length;
  }
  if (parts.length === 0) return body;
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

interface MessageThreadProps {
  conversation: ConversationDetail;
  onConversationChanged: () => void;
  canModerate: boolean;
}

const MessageThread = ({ conversation, onConversationChanged, canModerate }: MessageThreadProps) => {
  const { agencyId, currentUserId, members, memberByUserId } = useMessaging();
  const messages = useMessagingStore((s) => s.messagesByConversation[conversation.id]);
  const hydrated = useMessagingStore((s) => s.hydrated.has(conversation.id));
  const setMessages = useMessagingStore((s) => s.setMessages);
  const prependMessages = useMessagingStore((s) => s.prependMessages);
  const markLocallyRead = useMessagingStore((s) => s.markLocallyRead);
  const typing = useMessagingStore((s) => s.typingByConversation[conversation.id]);

  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(conversation.title);
  const [addOpen, setAddOpen] = useState(false);
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeParticipants = conversation.participants.filter((p) => p.left_at === null);
  const isGroup = conversation.kind === "group";

  const mentionHandles = useMemo(
    () => new Set(conversation.participants.map((p) => p.user_name.toLowerCase())),
    [conversation.participants],
  );

  // Load history the first time this conversation is opened.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void loadMessagesAction(agencyId, conversation.id, {
      limit: PAGE_SIZE,
    }).then((result) => {
      if (cancelled) return;
      if (result.messages) {
        setMessages(conversation.id, result.messages);
        setReachedStart(result.messages.length < PAGE_SIZE);
      } else if (result.error) {
        toast.error(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, conversation.id, hydrated, setMessages]);

  // Mark read on open and whenever new messages land while this thread is shown.
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    markLocallyRead(conversation.id);
    const timer = setTimeout(() => {
      void markReadAction(agencyId, conversation.id);
    }, 400);
    return () => clearTimeout(timer);
  }, [agencyId, conversation.id, messages?.length, markLocallyRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep pinned to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const handleLoadOlder = async () => {
    if (!messages || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await loadMessagesAction(agencyId, conversation.id, {
        limit: PAGE_SIZE,
        before: messages[0].created_at,
      });
      if (result.messages) {
        prependMessages(conversation.id, result.messages);
        if (result.messages.length < PAGE_SIZE) setReachedStart(true);
      } else if (result.error) {
        toast.error(result.error);
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleRename = async () => {
    const title = renameDraft.trim();
    setRenaming(false);
    if (!title || title === conversation.title) return;
    const result = await renameConversationAction(agencyId, conversation.id, title);
    if (result.error) toast.error(result.error);
    else onConversationChanged();
  };

  const handleAddPeople = async () => {
    if (addSelected.size === 0) return;
    const result = await addParticipantsAction(agencyId, conversation.id, [...addSelected]);
    setAddOpen(false);
    setAddSelected(new Set());
    if (result.error) toast.error(result.error);
    else onConversationChanged();
  };

  const handleToggleMute = async () => {
    const result = await toggleMuteAction(agencyId, conversation.id, !conversation.is_muted);
    if (result.error) toast.error(result.error);
    else onConversationChanged();
  };

  const handleLeave = async () => {
    const result = await removeParticipantAction(agencyId, conversation.id, currentUserId);
    if (result.error) toast.error(result.error);
    else onConversationChanged();
  };

  const handleRemove = async (userId: string) => {
    const result = await removeParticipantAction(agencyId, conversation.id, userId);
    if (result.error) toast.error(result.error);
    else onConversationChanged();
  };

  const handleSaveEdit = async (messageId: string) => {
    const body = editDraft.trim();
    setEditingId(null);
    if (!body) return;
    const result = await editMessageAction(agencyId, conversation.id, messageId, body);
    if (result.error) toast.error(result.error);
  };

  const handleDelete = async (messageId: string) => {
    const result = await deleteMessageAction(agencyId, conversation.id, messageId);
    if (result.error) toast.error(result.error);
  };

  const typers = useMemo(() => {
    if (!typing) return [];
    return Object.entries(typing).map(([userId, t]) => ({
      userId,
      name: t.name,
    }));
  }, [typing]);
  const typingNames = typers.map((t) => t.name);

  // Everyone but the caller, so a direct conversation shows the other person.
  const headerPeople = activeParticipants.filter((p) => p.user_id !== currentUserId);
  const stackPeople = (headerPeople.length > 0 ? headerPeople : activeParticipants).slice(0, HEADER_AVATARS);
  const stackOverflow = Math.max(0, headerPeople.length - HEADER_AVATARS);

  return (
    <div className={styles.thread}>
      <header className={styles.header}>
        <div className={styles.avatarStack} data-count={stackPeople.length}>
          {stackPeople.map((p) => (
            <MessageAvatar
              key={p.user_id}
              agencyId={agencyId}
              name={p.full_name}
              member={memberByUserId.get(p.user_id)}
              className={styles.stackAvatar}
            />
          ))}
          {stackOverflow > 0 && <span className={styles.stackOverflow}>+{stackOverflow}</span>}
        </div>
        <div className={styles.headerMain}>
          {renaming ? (
            <input
              autoFocus
              className={styles.renameInput}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={handleRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRename();
                if (event.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <h2 className={styles.title}>{conversation.title}</h2>
          )}
          <p className={styles.participants}>
            {activeParticipants.map((p) => p.full_name).join(", ")}
            {conversation.project_name && ` · ${conversation.project_name}`}
            {!conversation.project_name && conversation.client_name && ` · ${conversation.client_name}`}
          </p>
        </div>

        <Menu.Root>
          <Menu.Trigger className={styles.menuTrigger} aria-label="Conversation settings">
            <MoreHorizontal aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={styles.menuPositioner} sideOffset={6} align="end">
              <Menu.Popup className={styles.menuPopup}>
                {isGroup && (
                  <Menu.Item
                    className={styles.menuItem}
                    onClick={() => {
                      setRenameDraft(conversation.title);
                      setRenaming(true);
                    }}
                  >
                    Rename group
                  </Menu.Item>
                )}
                {isGroup && (
                  <Menu.Item className={styles.menuItem} onClick={() => setAddOpen(true)}>
                    Add people
                  </Menu.Item>
                )}
                <Menu.Item className={styles.menuItem} onClick={handleToggleMute}>
                  {conversation.is_muted ? "Unmute" : "Mute"} conversation
                </Menu.Item>
                {isGroup && (
                  <Menu.Item className={`${styles.menuItem} ${styles.danger}`} onClick={handleLeave}>
                    Leave conversation
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        {!reachedStart && messages && messages.length > 0 && (
          <button type="button" className={styles.loadOlder} onClick={handleLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        )}

        {!messages ? (
          <p className={styles.loading}>Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className={styles.loading}>No messages yet — say hello.</p>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDivider = !previous || !isSameDay(new Date(previous.created_at), new Date(message.created_at));
            const grouped =
              previous &&
              !showDivider &&
              previous.sender_id === message.sender_id &&
              previous.message_type === "user" &&
              message.message_type === "user";

            return (
              <div key={message.id}>
                {showDivider && (
                  <div className={styles.dayDivider}>
                    <span>{format(new Date(message.created_at), "EEEE, MMM d")}</span>
                  </div>
                )}
                {message.message_type === "system" ? (
                  <p className={styles.systemMessage}>{message.body}</p>
                ) : (
                  <MessageRow
                    message={message}
                    grouped={Boolean(grouped)}
                    mine={message.sender_id === currentUserId}
                    member={message.sender_id ? memberByUserId.get(message.sender_id) : undefined}
                    canModerate={canModerate}
                    agencyId={agencyId}
                    conversationId={conversation.id}
                    mentionHandles={mentionHandles}
                    editing={editingId === message.id}
                    editDraft={editDraft}
                    onStartEdit={() => {
                      setEditingId(message.id);
                      setEditDraft(message.body);
                    }}
                    onEditDraft={setEditDraft}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => void handleSaveEdit(message.id)}
                    onDelete={() => void handleDelete(message.id)}
                  />
                )}
              </div>
            );
          })
        )}

        {typers.length > 0 && (
          <div className={styles.typing} aria-live="polite">
            <span className={styles.typingAvatars}>
              {typers.slice(0, 3).map((t) => (
                <MessageAvatar
                  key={t.userId}
                  agencyId={agencyId}
                  name={t.name}
                  member={memberByUserId.get(t.userId)}
                  size="sm"
                />
              ))}
            </span>
            <span className={styles.typingDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className={styles.typingLabel}>
              {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer conversationId={conversation.id} />

      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Add people to the conversation">
            <Dialog.Title className={styles.dialogTitle}>Add people</Dialog.Title>
            <MemberMultiSelect
              members={members}
              selected={addSelected}
              onChange={setAddSelected}
              exclude={new Set(activeParticipants.map((p) => p.user_id))}
            />
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogCancel} onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dialogSubmit}
                onClick={handleAddPeople}
                disabled={addSelected.size === 0}
              >
                Add
              </button>
            </div>
            {isGroup && activeParticipants.length > 2 && (
              <ul className={styles.participantManageList}>
                {activeParticipants
                  .filter((p) => p.user_id !== currentUserId)
                  .map((p) => (
                    <li key={p.user_id}>
                      <span>{p.full_name}</span>
                      <button type="button" onClick={() => void handleRemove(p.user_id)}>
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

interface MessageRowProps {
  message: Message;
  grouped: boolean;
  mine: boolean;
  member: AgencyMember | undefined;
  canModerate: boolean;
  agencyId: string;
  conversationId: string;
  mentionHandles: Set<string>;
  editing: boolean;
  editDraft: string;
  onStartEdit: () => void;
  onEditDraft: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}

const MessageRow = ({
  message,
  grouped,
  mine,
  member,
  canModerate,
  agencyId,
  conversationId,
  mentionHandles,
  editing,
  editDraft,
  onStartEdit,
  onEditDraft,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: MessageRowProps) => {
  const pending = message.id.startsWith("optimistic-");
  const deleted = message.deleted_at !== null;
  const createdAt = new Date(message.created_at);

  return (
    <div className={styles.message} data-grouped={grouped} data-pending={pending} data-mine={mine}>
      <div className={styles.gutter}>
        {grouped ? (
          // Follow-ups in a run skip the avatar; the time shows on hover instead.
          <time className={styles.gutterTime} dateTime={message.created_at} title={format(createdAt, "PPpp")}>
            {format(createdAt, "p")}
          </time>
        ) : (
          <MessageAvatar agencyId={agencyId} name={message.sender_name} member={member} />
        )}
      </div>

      <div className={styles.content}>
        {!grouped && (
          <div className={styles.messageMeta}>
            <span className={styles.sender}>{mine ? "You" : message.sender_name}</span>
            <time className={styles.timestamp} dateTime={message.created_at} title={format(createdAt, "PPpp")}>
              {format(createdAt, "p")}
            </time>
          </div>
        )}

        {deleted ? (
          <p className={styles.deleted}>Message deleted</p>
        ) : editing ? (
          <div className={styles.editBox}>
            <textarea
              autoFocus
              className={styles.editTextarea}
              value={editDraft}
              onChange={(event) => onEditDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSaveEdit();
                }
                if (event.key === "Escape") onCancelEdit();
              }}
            />
            <div className={styles.editActions}>
              <button type="button" onClick={onCancelEdit}>
                Cancel
              </button>
              <button type="button" onClick={onSaveEdit}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.body && (
              <p className={styles.body}>
                {renderBody(message.body, mentionHandles)}
                {message.edited_at && <span className={styles.edited}> (edited)</span>}
              </p>
            )}
            {message.attachments.length > 0 && (
              <div className={styles.attachments}>
                {message.attachments.map((attachment) => (
                  <MessageAttachmentView
                    key={attachment.id}
                    agencyId={agencyId}
                    conversationId={conversationId}
                    messageId={message.id}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {!deleted && !pending && (mine || canModerate) && (
          <div className={styles.rowActions}>
            {mine && !editing && (
              <button type="button" onClick={onStartEdit} aria-label="Edit message">
                <Pencil aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={onDelete} aria-label="Delete message">
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageThread;
