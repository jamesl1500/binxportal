/**
 * MessagingProvider.tsx
 *
 * Owns the one messaging websocket for the whole inbox and keeps
 * `useMessagingStore` live from it. Mounted by `app/(app)/messages/layout.tsx`
 * (and the project/client Messages tabs) so a single socket serves every
 * conversation view.
 *
 * The socket is push-only: binx-api sends message/conversation events, the
 * client only ever sends `typing` and `ping`. A dropped socket reconnects
 * with capped backoff, and — belt and braces — the conversation list is
 * refetched on tab focus and on a slow interval so a missed event always
 * reconciles.
 *
 * @module apps/binx-web/src/components/messaging/MessagingProvider/MessagingProvider.tsx
 * @author Binx.io
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { AgencyMember } from "@/lib/agencies";
import type { Conversation, MessagingEvent } from "@/lib/messaging-client";
import { listConversationsAction } from "@/app/(app)/messages/actions";
import { useMessagingStore } from "@/stores/use-messaging-store";

/** Minimal client reference for the "link to client" picker + the inbox filter. */
export interface MessagingClientRef {
  id: string;
  name: string;
}

interface MessagingContextValue {
  agencyId: string;
  currentUserId: string;
  /** Agency members available to start a conversation with (excludes the caller). */
  members: AgencyMember[];
  /** Every agency member (caller included) keyed by user id — for sender avatars. */
  memberByUserId: Map<string, AgencyMember>;
  /** Every client in the agency — for linking a new conversation and filtering the list. */
  clients: MessagingClientRef[];
  /** Re-pull the conversation list from the server (structural changes, reconnects, focus). */
  refreshConversations: () => Promise<void>;
  /** Send a "typing" ping for a conversation, throttled by the caller. */
  sendTyping: (conversationId: string) => void;
  socketStatus: "connecting" | "open" | "closed";
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

export function useMessaging(): MessagingContextValue {
  const value = useContext(MessagingContext);
  if (!value) {
    throw new Error("useMessaging must be used inside <MessagingProvider>");
  }
  return value;
}

interface MessagingProviderProps {
  agencyId: string;
  currentUserId: string;
  /** Every agency member, caller included — the picker list is derived from this. */
  members: AgencyMember[];
  clients?: MessagingClientRef[];
  initialConversations: Conversation[];
  /** When set, the list view is scoped to this context and refetches stay scoped too. */
  scope?: { clientId?: string; projectId?: string };
  children: React.ReactNode;
}

const STRUCTURAL_EVENTS = new Set<MessagingEvent["type"]>([
  "conversation.created",
  "conversation.updated",
  "participant.added",
  "participant.removed",
]);

function wsBaseUrl(): string | null {
  const httpBase = process.env.NEXT_PUBLIC_API_URL;
  if (!httpBase) return null;
  return httpBase.replace(/^http/, "ws").replace(/\/$/, "");
}

const MessagingProvider = ({
  agencyId,
  currentUserId,
  members,
  clients = [],
  initialConversations,
  scope,
  children,
}: MessagingProviderProps) => {
  const seed = useMessagingStore((s) => s.seed);
  const setConversations = useMessagingStore((s) => s.setConversations);
  const applyEvent = useMessagingStore((s) => s.applyEvent);
  const pruneTyping = useMessagingStore((s) => s.pruneTyping);
  const setSocketStatus = useMessagingStore((s) => s.setSocketStatus);
  const storeSocketStatus = useMessagingStore((s) => s.socketStatus);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const [, force] = useState(0);

  const scopeKey = `${scope?.clientId ?? ""}|${scope?.projectId ?? ""}`;

  const refreshConversations = useCallback(async () => {
    const result = await listConversationsAction(agencyId, {
      clientId: scope?.clientId,
      projectId: scope?.projectId,
    });
    if (result.conversations) {
      setConversations(result.conversations);
    }
  }, [agencyId, scope?.clientId, scope?.projectId, setConversations]);

  // Seed the store from the server render whenever the scope changes.
  useEffect(() => {
    seed(currentUserId, initialConversations);
  }, [seed, currentUserId, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The websocket connection, with reconnect backoff.
  useEffect(() => {
    // A per-invocation local, not a ref: React StrictMode's dev-mode
    // mount/cleanup/mount means a stale invocation's connect() can still be
    // awaiting its ticket fetch when this effect starts fresh. A *shared*
    // "closed" ref reset at the top of every invocation defeats its own
    // purpose (the fresh invocation's reset flips it back to false before
    // the stale one's fetch resolves) — a fresh `let` per invocation is the
    // only thing that actually stays true for the invocation it belongs to,
    // so the stale connect() correctly bails instead of opening a socket
    // nothing will ever close (which then keeps applying every event
    // a second time, alongside the real one).
    let closed = false;

    const connect = async () => {
      if (closed) return;
      setSocketStatus("connecting");
      let ticket: string;
      try {
        const response = await fetch("/api/messages/ws-ticket", {
          method: "POST",
        });
        if (!response.ok) throw new Error("ticket");
        ({ ticket } = await response.json());
      } catch {
        scheduleReconnect();
        return;
      }
      if (closed) return;

      const base = wsBaseUrl();
      if (!base) {
        setSocketStatus("closed");
        return;
      }

      const socket = new WebSocket(`${base}/ws/messages?ticket=${encodeURIComponent(ticket)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setSocketStatus("open");
        force((n) => n + 1);
        // A reconnect may have missed events — reconcile.
        void refreshConversations();
      };

      socket.onmessage = (raw) => {
        let event: MessagingEvent;
        try {
          event = JSON.parse(raw.data);
        } catch {
          return;
        }
        if (event.type === "pong") return;
        applyEvent(event);
        if (STRUCTURAL_EVENTS.has(event.type)) {
          void refreshConversations();
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        setSocketStatus("closed");
        force((n) => n + 1);
        scheduleReconnect();
      };

      socket.onerror = () => socket.close();
    };

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      const delay = Math.min(30_000, 1000 * 2 ** attemptRef.current);
      attemptRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    void connect();

    return () => {
      closed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [agencyId, applyEvent, refreshConversations, setSocketStatus]);

  // Safety net: refetch on tab focus, and prune stale typing indicators.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshConversations();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => {
      pruneTyping();
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        void refreshConversations();
      }
    }, 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [refreshConversations, pruneTyping]);

  const sendTyping = useCallback((conversationId: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "typing", conversation_id: conversationId }));
    }
  }, []);

  const memberByUserId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const otherMembers = useMemo(
    () => members.filter((member) => member.user_id !== currentUserId),
    [members, currentUserId],
  );

  const value = useMemo<MessagingContextValue>(
    () => ({
      agencyId,
      currentUserId,
      members: otherMembers,
      memberByUserId,
      clients,
      refreshConversations,
      sendTyping,
      socketStatus: storeSocketStatus,
    }),
    [
      agencyId,
      currentUserId,
      otherMembers,
      memberByUserId,
      clients,
      refreshConversations,
      sendTyping,
      storeSocketStatus,
    ],
  );

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
};

export default MessagingProvider;
