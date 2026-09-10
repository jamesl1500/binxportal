/**
 * BoardProvider.tsx
 *
 * Owns the one websocket for a project collaboration canvas and keeps
 * `useBoardStore` live from it. Mounted by the canvas page (staff or portal).
 *
 * The socket is the shared per-user event stream (`/ws/messages` — really a
 * generic bus); this provider consumes only `board.item.*` events and drops
 * the rest. A dropped socket reconnects with capped backoff, and the board is
 * re-pulled on reconnect and tab focus so a missed event always reconciles.
 * The pattern is lifted from `MessagingProvider.tsx`.
 *
 * @module apps/binx-web/src/components/boards/BoardProvider/BoardProvider.tsx
 * @author Binx.io
 */
"use client";

import { useCallback, useEffect, useRef } from "react";

import type { BoardEvent, BoardItem } from "@/lib/boards-client";
import { BOARD_EVENT_TYPES } from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";

interface BoardProviderProps {
  boardId: string;
  currentUserId: string;
  initialItems: BoardItem[];
  /** Re-pull the whole board from the server (reconnect / focus reconcile). */
  resync: () => Promise<BoardItem[] | null>;
  children: React.ReactNode;
}

function wsBaseUrl(): string | null {
  const httpBase = process.env.NEXT_PUBLIC_API_URL;
  if (!httpBase) return null;
  return httpBase.replace(/^http/, "ws").replace(/\/$/, "");
}

const BoardProvider = ({ boardId, currentUserId, initialItems, resync, children }: BoardProviderProps) => {
  const seed = useBoardStore((s) => s.seed);
  const setItems = useBoardStore((s) => s.setItems);
  const applyEvent = useBoardStore((s) => s.applyEvent);
  const setSocketStatus = useBoardStore((s) => s.setSocketStatus);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    seed(boardId, initialItems, currentUserId);
  }, [seed, boardId, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const doResync = useCallback(async () => {
    const items = await resync().catch(() => null);
    if (items) setItems(items);
  }, [resync, setItems]);

  useEffect(() => {
    closedRef.current = false;

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      const delay = Math.min(30_000, 1000 * 2 ** attemptRef.current);
      attemptRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    async function connect() {
      if (closedRef.current) return;
      setSocketStatus("connecting");

      let ticket: string;
      try {
        const response = await fetch("/api/messages/ws-ticket", { method: "POST" });
        if (!response.ok) throw new Error("ticket");
        ({ ticket } = await response.json());
      } catch {
        scheduleReconnect();
        return;
      }

      const wsBase = wsBaseUrl();
      if (!wsBase) {
        setSocketStatus("closed");
        return;
      }

      const socket = new WebSocket(`${wsBase}/ws/messages?ticket=${encodeURIComponent(ticket)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setSocketStatus("open");
        void doResync();
      };

      socket.onmessage = (raw) => {
        let event: BoardEvent | { type?: string; board_id?: string };
        try {
          event = JSON.parse(raw.data);
        } catch {
          return;
        }
        if (!event.type || !BOARD_EVENT_TYPES.has(event.type)) return;
        if (event.board_id !== boardId) return;
        applyEvent(event as BoardEvent);
      };

      socket.onclose = () => {
        socketRef.current = null;
        setSocketStatus("closed");
        scheduleReconnect();
      };

      socket.onerror = () => socket.close();
    }

    void connect();

    return () => {
      closedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [boardId, applyEvent, doResync, setSocketStatus]);

  // Safety net: reconcile on tab focus and while the socket is down.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void doResync();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) void doResync();
    }, 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [doResync]);

  return <>{children}</>;
};

export default BoardProvider;
