/**
 * ConversationList.tsx
 *
 * The left pane of the inbox: the caller's conversations, newest activity
 * first, each row showing the title, a preview of the last message, relative
 * time, an unread count, and a mute icon. A search box plus two dropdown
 * filters (by client, by teammate) narrow the list — handy once you have more
 * than a handful of threads. Filter state lives in the messaging store so it
 * survives navigating in and out of a conversation.
 *
 * Selecting a row routes to `/messages/{id}`.
 *
 * @module apps/binx-web/src/components/messaging/ConversationList/ConversationList.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { BellOff, Users, X } from "lucide-react";

import { useMessagingStore } from "@/stores/use-messaging-store";
import { useMessaging } from "@/components/messaging/MessagingProvider/MessagingProvider";
import NewConversationDialog from "@/components/messaging/NewConversationDialog/NewConversationDialog";

import styles from "./ConversationList.module.scss";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  /** Seeds the client filter once, e.g. when arriving from `/messages?client=…`. */
  initialClientId?: string | null;
}

const NO_CLIENT = "__none__";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  } catch {
    return "";
  }
}

const ConversationList = ({ activeConversationId, onSelect, initialClientId }: ConversationListProps) => {
  const conversations = useMessagingStore((s) => s.conversations);
  const filters = useMessagingStore((s) => s.conversationFilters);
  const setFilters = useMessagingStore((s) => s.setConversationFilters);
  const { members, clients } = useMessaging();

  // Apply the client seed from the URL once (only if the user hasn't already
  // picked a filter this session).
  useEffect(() => {
    if (initialClientId) setFilters({ clientId: initialClientId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId]);

  // Only offer clients/members that actually appear in the caller's threads,
  // so the dropdowns stay short and every option yields a result.
  const clientOptions = useMemo(() => {
    const present = new Set(conversations.map((c) => c.client_id).filter(Boolean) as string[]);
    const byId = new Map(clients.map((client) => [client.id, client.name]));
    return [...present]
      .map((id) => ({ id, name: byId.get(id) ?? "Unknown client" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations, clients]);

  const hasUnlinked = useMemo(() => conversations.some((c) => c.client_id === null), [conversations]);

  const memberOptions = useMemo(() => {
    const present = new Set(conversations.flatMap((c) => c.participant_names));
    return members
      .filter((member) => present.has(member.full_name))
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [conversations, members]);

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filters.clientId === NO_CLIENT && c.client_id !== null) return false;
      if (filters.clientId && filters.clientId !== NO_CLIENT && c.client_id !== filters.clientId) return false;
      if (filters.memberName && !c.participant_names.includes(filters.memberName)) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q) ||
        c.participant_names.some((name) => name.toLowerCase().includes(q))
      );
    });
  }, [conversations, filters]);

  const filtersActive = Boolean(filters.search || filters.clientId || filters.memberName);

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.heading}>Messages</h2>
          <NewConversationDialog />
        </div>
        <input
          type="search"
          className={styles.search}
          placeholder="Search conversations…"
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          aria-label="Search conversations"
        />
        <div className={styles.filterRow}>
          <select
            className={styles.filter}
            value={filters.clientId ?? ""}
            onChange={(event) => setFilters({ clientId: event.target.value || null })}
            aria-label="Filter by client"
          >
            <option value="">All clients</option>
            {hasUnlinked && <option value={NO_CLIENT}>No client</option>}
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>

          <select
            className={styles.filter}
            value={filters.memberName ?? ""}
            onChange={(event) => setFilters({ memberName: event.target.value || null })}
            aria-label="Filter by teammate"
          >
            <option value="">Anyone</option>
            {memberOptions.map((member) => (
              <option key={member.user_id} value={member.full_name}>
                {member.full_name}
              </option>
            ))}
          </select>

          {filtersActive && (
            <button
              type="button"
              className={styles.clearFilters}
              onClick={() => setFilters({ search: "", clientId: null, memberName: null })}
            >
              <X aria-hidden="true" /> Clear
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {conversations.length === 0
            ? "No conversations yet. Start one with the New message button."
            : "No conversations match your search and filters."}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={styles.row}
                data-active={conversation.id === activeConversationId}
                data-unread={conversation.unread_count > 0}
                onClick={() => onSelect(conversation.id)}
              >
                <span className={styles.rowTop}>
                  <span className={styles.title}>
                    {conversation.kind === "group" && <Users className={styles.groupIcon} aria-hidden="true" />}
                    {conversation.title}
                    {conversation.is_muted && <BellOff className={styles.muteIcon} aria-label="Muted" />}
                  </span>
                  <span className={styles.time}>{relativeTime(conversation.last_message_at)}</span>
                </span>
                <span className={styles.rowBottom}>
                  <span className={styles.preview}>{conversation.last_message_preview ?? "No messages yet"}</span>
                  {conversation.unread_count > 0 && (
                    <span className={styles.badge}>{conversation.unread_count}</span>
                  )}
                </span>
                {(conversation.client_name || conversation.project_name) && (
                  <span className={styles.context}>
                    {conversation.project_name ?? conversation.client_name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ConversationList;
