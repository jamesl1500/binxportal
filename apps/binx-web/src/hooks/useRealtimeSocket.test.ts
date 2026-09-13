import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRealtimeSocket } from "./useRealtimeSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

const originalFetch = global.fetch;
const originalWebSocket = global.WebSocket;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

beforeEach(() => {
  FakeWebSocket.instances = [];
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ticket: "tok" }) });
  // @ts-expect-error -- test double, not a full WebSocket implementation
  global.WebSocket = FakeWebSocket;
});

afterEach(() => {
  global.fetch = originalFetch;
  global.WebSocket = originalWebSocket;
  process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  vi.restoreAllMocks();
});

describe("useRealtimeSocket", () => {
  it("fetches a ticket and connects to the shared per-user event stream", async () => {
    renderHook(() => useRealtimeSocket(vi.fn()));

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(global.fetch).toHaveBeenCalledWith("/api/messages/ws-ticket", { method: "POST" });
    expect(FakeWebSocket.instances[0].url).toBe("ws://localhost:8000/ws/messages?ticket=tok");
  });

  it("reports status transitioning from connecting to open", async () => {
    const { result } = renderHook(() => useRealtimeSocket(vi.fn()));
    expect(result.current).toBe("connecting");

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].onopen?.());
    await waitFor(() => expect(result.current).toBe("open"));
  });

  it("calls onEvent with the parsed payload for a real event", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeSocket(onEvent));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => {
      FakeWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: "notification.created", data: { id: "n1" } }),
      });
    });

    expect(onEvent).toHaveBeenCalledWith({ type: "notification.created", data: { id: "n1" } });
  });

  it("ignores pong keepalives", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeSocket(onEvent));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "pong" }) }));

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores a message that isn't valid JSON", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeSocket(onEvent));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => FakeWebSocket.instances[0].onmessage?.({ data: "not json" }));

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("closes the socket on unmount", async () => {
    const { unmount } = renderHook(() => useRealtimeSocket(vi.fn()));
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    unmount();

    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  it("reports closed status when NEXT_PUBLIC_API_URL isn't configured", async () => {
    process.env.NEXT_PUBLIC_API_URL = "";
    const { result } = renderHook(() => useRealtimeSocket(vi.fn()));

    await waitFor(() => expect(result.current).toBe("closed"));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  // Regression test: an earlier version didn't re-check whether the effect
  // had already been cleaned up after the (async) ticket fetch resolved, so
  // React StrictMode's dev-mode mount/cleanup/mount left a leaked socket
  // that never closed and kept processing every broadcast alongside the
  // real one — every live event landed twice (caught live via Playwright,
  // not this test — this test just pins the fix down).
  it("never opens a socket for an effect that was cleaned up before its ticket fetch resolved", async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ ticket: string }> }) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));

    const { unmount } = renderHook(() => useRealtimeSocket(vi.fn()));
    unmount();

    resolveFetch({ ok: true, json: async () => ({ ticket: "tok" }) });
    // Let the resumed connect() continue past the await.
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
