import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getAccessToken: vi.fn() }));

import { NextRequest } from "next/server";

import { getAccessToken } from "@/lib/auth";
import { POST } from "./route";

const mockedGetAccessToken = vi.mocked(getAccessToken);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/ai/a1/c1/messages/stream", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function routeParams() {
  return { params: Promise.resolve({ agencyId: "a1", conversationId: "c1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/");
  mockedGetAccessToken.mockResolvedValue("tok");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/ai/[agencyId]/[conversationId]/messages/stream", () => {
  it("returns 401 when there's no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    const res = await POST(makeRequest({ message: "hi" }), routeParams());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Not authenticated" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 500 when the API isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const res = await POST(makeRequest({ message: "hi" }), routeParams());
    expect(res.status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies the request to binx-api with the bearer token and streams the response through", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type": "delta", "text": "hi"}\n\n'));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const res = await POST(makeRequest({ message: "hello" }), routeParams());

    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/agencies/a1/ai/conversations/c1/messages/stream",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe('data: {"type": "delta", "text": "hi"}\n\n');
  });

  it("strips a trailing slash from NEXT_PUBLIC_API_URL before building the upstream URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new ReadableStream(), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    await POST(makeRequest({ message: "hi" }), routeParams());

    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/agencies/a1/ai/conversations/c1/messages/stream",
      expect.anything(),
    );
  });

  it("forwards binx-api's error detail and status when the upstream call fails before streaming", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Conversation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await POST(makeRequest({ message: "hi" }), routeParams());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "Conversation not found" });
  });

  it("returns 502 when the upstream fetch itself throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    const res = await POST(makeRequest({ message: "hi" }), routeParams());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ message: "Unable to reach the assistant" });
  });
});
