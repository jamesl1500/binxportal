/**
 * use-messaging-store.ts
 *
 * Client-side state for the messaging inbox: the conversation list, loaded
 * message history per conversation, and transient typing indicators. The
 * MessagingProvider seeds it from the server render, then keeps it live by
 * applying websocket events (see `applyEvent`) and the results of server
 * actions. This is a deliberate departure from the app's usual "mutate then
 * router.refresh()" pattern — a chat needs sub-second, socket-driven updates
 * that a full route refetch can't give.
 *
 * @module apps/binx-web/src/stores/use-messaging-store.ts
 * @author Binx.io
 */
import { create } from "zustand";

import type { Conversation, Message, MessagingEvent } from "@/lib/messaging-client";

export type SocketStatus = "connecting" | "open" | "closed";

/** The inbox's search + filter state. Kept in the store so it survives
 * navigating between `/messages` and `/messages/{id}` (the list pane
 * remounts, the store doesn't). */
export interface ConversationFilters {
  search: string;
  /** Agency client id, or "none" for conversations linked to no client, or null for "any". */
  clientId: string | null;
  /** A participant's full name, or null for "anyone". */
  memberName: string | null;
}

interface TypingState {
  /** userId -> the timestamp their last "typing" ping arrived (ms). */
  [userId: string]: { name: string; at: number };
}

interface MessagingState {
  currentUserId: string;
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  /** Conversations whose full history has been loaded at least once. */
  hydrated: Set<string>;
  typingByConversation: Record<string, TypingState>;
  socketStatus: SocketStatus;
  conversationFilters: ConversationFilters;

  setConversationFilters: (patch: Partial<ConversationFilters>) => void;
  seed: (currentUserId: string, conversations: Conversation[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  upsertConversation: (conversation: Conversation) => void;
  setSocketStatus: (status: SocketStatus) => void;

  setMessages: (conversationId: string, messages: Message[]) => void;
  prependMessages: (conversationId: string, older: Message[]) => void;
  upsertMessage: (conversationId: string, message: Message) => void;
  removeOptimistic: (conversationId: string, nonce: string) => void;

  markLocallyRead: (conversationId: string) => void;
  noteTyping: (conversationId: string, userId: string, name: string) => void;
  pruneTyping: () => void;

  /** Apply one realtime event. Returns the conversation ids that may need a server refetch. */
  applyEvent: (event: MessagingEvent) => void;
}

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const at = new Date(a.last_message_at ?? a.created_at).getTime();
    const bt = new Date(b.last_message_at ?? b.created_at).getTime();
    return bt - at;
  });
}

function mergeMessage(existing: Message[], incoming: Message): Message[] {
  const withoutOptimisticEcho = incoming.id.startsWith("optimistic-")
    ? existing
    : existing.filter((m) => !(m.id.startsWith("optimistic-") && m.body === incoming.body && m.sender_id === incoming.sender_id));
  const index = withoutOptimisticEcho.findIndex((m) => m.id === incoming.id);
  if (index >= 0) {
    const next = [...withoutOptimisticEcho];
    next[index] = incoming;
    return next;
  }
  return [...withoutOptimisticEcho, incoming].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  currentUserId: "",
  conversations: [],
  messagesByConversation: {},
  hydrated: new Set(),
  typingByConversation: {},
  socketStatus: "connecting",
  conversationFilters: { search: "", clientId: null, memberName: null },

  setConversationFilters: (patch) =>
    set((state) => ({ conversationFilters: { ...state.conversationFilters, ...patch } })),

  seed: (currentUserId, conversations) =>
    set({ currentUserId, conversations: sortConversations(conversations) }),

  setConversations: (conversations) => set({ conversations: sortConversations(conversations) }),

  upsertConversation: (conversation) =>
    set((state) => {
      const rest = state.conversations.filter((c) => c.id !== conversation.id);
      return { conversations: sortConversations([conversation, ...rest]) };
    }),

  setSocketStatus: (socketStatus) => set({ socketStatus }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
      hydrated: new Set(state.hydrated).add(conversationId),
    })),

  prependMessages: (conversationId, older) =>
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      const seen = new Set(current.map((m) => m.id));
      const merged = [...older.filter((m) => !seen.has(m.id)), ...current];
      return { messagesByConversation: { ...state.messagesByConversation, [conversationId]: merged } };
    }),

  upsertMessage: (conversationId, message) =>
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: mergeMessage(current, message),
        },
      };
    }),

  removeOptimistic: (conversationId, nonce) =>
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: current.filter((m) => m.id !== `optimistic-${nonce}`),
        },
      };
    }),

  markLocallyRead: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c,
      ),
    })),

  noteTyping: (conversationId, userId, name) =>
    set((state) => ({
      typingByConversation: {
        ...state.typingByConversation,
        [conversationId]: {
          ...(state.typingByConversation[conversationId] ?? {}),
          [userId]: { name, at: Date.now() },
        },
      },
    })),

  pruneTyping: () =>
    set((state) => {
      const cutoff = Date.now() - 6000;
      const next: Record<string, TypingState> = {};
      for (const [conversationId, typers] of Object.entries(state.typingByConversation)) {
        const kept = Object.fromEntries(Object.entries(typers).filter(([, v]) => v.at > cutoff));
        if (Object.keys(kept).length > 0) next[conversationId] = kept;
      }
      return { typingByConversation: next };
    }),

  applyEvent: (event) => {
    const state = get();
    const conversationId = event.conversation_id;
    if (!conversationId) return;

    switch (event.type) {
      case "message.created": {
        const message = event.data as unknown as Message;
        get().upsertMessage(conversationId, message);
        set((s) => ({
          conversations: sortConversations(
            s.conversations.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    last_message_at: message.created_at,
                    last_message_preview:
                      message.message_type === "system"
                        ? message.body
                        : message.body || "Sent an attachment",
                    unread_count:
                      message.sender_id && message.sender_id !== s.currentUserId
                        ? c.unread_count + 1
                        : c.unread_count,
                  }
                : c,
            ),
          ),
        }));
        break;
      }
      case "message.updated": {
        get().upsertMessage(conversationId, event.data as unknown as Message);
        break;
      }
      case "message.deleted": {
        const id = String((event.data as Record<string, unknown>)?.id ?? "");
        set((s) => {
          const current = s.messagesByConversation[conversationId] ?? [];
          return {
            messagesByConversation: {
              ...s.messagesByConversation,
              [conversationId]: current.map((m) =>
                m.id === id
                  ? { ...m, deleted_at: new Date().toISOString(), body: "", attachments: [] }
                  : m,
              ),
            },
          };
        });
        break;
      }
      case "conversation.read": {
        const userId = String((event.data as Record<string, unknown>)?.user_id ?? "");
        if (userId === state.currentUserId) get().markLocallyRead(conversationId);
        break;
      }
      case "typing": {
        const data = (event.data ?? {}) as Record<string, unknown>;
        const userId = String(data.user_id ?? "");
        if (userId && userId !== state.currentUserId) {
          get().noteTyping(conversationId, userId, String(data.user_name ?? "Someone"));
        }
        break;
      }
      // conversation.created / conversation.updated / participant.* — the
      // provider refetches the list for these; nothing to patch here.
      default:
        break;
    }
  },
}));
