/**
 * useRealtimeSocket.ts
 *
 * Opens the shared per-user event socket binx-api exposes at `/ws/messages`
 * — despite the name, it's a generic per-user event stream (messages, canvas
 * board changes, and now notifications/activity all ride it; see binx-api's
 * messaging/realtime.py) — and calls `onEvent` for every message received.
 * Reconnects with capped exponential backoff on drop.
 *
 * Each caller owns its own connection rather than sharing one: this app's
 * scale makes a handful of concurrent sockets per browser tab cheap, and it
 * keeps callers (the notification bell, the activity feed) independent of
 * whether `MessagingProvider` happens to be mounted too.
 *
 * @module apps/binx-web/src/hooks/useRealtimeSocket.ts
 * @author Binx.io
 */
"use client";

import { useEffect, useRef, useState } from "react";

export type RealtimeSocketStatus = "connecting" | "open" | "closed";

export interface RealtimeEvent {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

function wsBaseUrl(): string | null {
  const httpBase = process.env.NEXT_PUBLIC_API_URL;
  if (!httpBase) return null;
  return httpBase.replace(/^http/, "ws").replace(/\/$/, "");
}

/**
 * @param onEvent Called for every parsed, non-`pong` event. Kept in a ref
 * internally so passing an inline arrow function on every render doesn't
 * reconnect the socket.
 */
export function useRealtimeSocket(onEvent: (event: RealtimeEvent) => void): RealtimeSocketStatus {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const [status, setStatus] = useState<RealtimeSocketStatus>("connecting");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (closed) return;
      setStatus("connecting");
      let ticket: string;
      try {
        const response = await fetch("/api/messages/ws-ticket", { method: "POST" });
        if (!response.ok) throw new Error("ticket");
        ({ ticket } = await response.json());
      } catch {
        scheduleReconnect();
        return;
      }
      // The ticket fetch is an async gap — cleanup (e.g. React StrictMode's
      // dev-mode mount/cleanup/mount, or a genuine unmount) can have already
      // run while it was in flight. Without this check, a socket opened
      // after cleanup never gets closed: it keeps receiving every broadcast
      // alongside the new effect's own (correctly tracked) socket, so every
      // live event lands twice.
      if (closed) return;

      const base = wsBaseUrl();
      if (!base) {
        setStatus("closed");
        return;
      }

      socket = new WebSocket(`${base}/ws/messages?ticket=${encodeURIComponent(ticket)}`);

      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
      };

      socket.onmessage = (raw) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(raw.data);
        } catch {
          return;
        }
        if (event.type === "pong") return;
        onEventRef.current(event);
      };

      socket.onclose = () => {
        socket = null;
        setStatus("closed");
        scheduleReconnect();
      };

      socket.onerror = () => socket?.close();
    };

    void connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    };
  }, []);

  return status;
}
