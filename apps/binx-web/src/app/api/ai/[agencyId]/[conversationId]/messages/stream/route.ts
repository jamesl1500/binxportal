/**
 * route.ts - Ask AI Streaming Proxy
 *
 * Streams the assistant's reply from binx-api's SSE endpoint straight
 * through to the browser. Every other authenticated call in this app is
 * buffered (the shared axios instance in `lib/api.ts`) — this route exists
 * because axios can't hand back a native `ReadableStream` without extra
 * adapting, so it uses a plain `fetch()` instead, whose `Response.body`
 * already is one. Same "server holds the bearer token, browser holds the
 * httpOnly session cookie" split every other authenticated call in this app
 * uses — the browser still never talks to binx-api directly.
 *
 * @module apps/binx-web/src/app/api/ai/[agencyId]/[conversationId]/messages/stream/route.ts
 * @route POST /api/ai/{agencyId}/{conversationId}/messages/stream
 */
import { NextRequest, NextResponse } from "next/server";

import { getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ agencyId: string; conversationId: string }>;
}

function apiBaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { agencyId, conversationId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const base = apiBaseUrl();
  if (!base) {
    return NextResponse.json({ message: "The API isn't configured" }, { status: 500 });
  }

  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/agencies/${agencyId}/ai/conversations/${conversationId}/messages/stream`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body,
    });
  } catch {
    return NextResponse.json({ message: "Unable to reach the assistant" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    let message = "Unable to reach the assistant";
    try {
      const data = await upstream.json();
      message = typeof data?.detail === "string" ? data.detail : message;
    } catch {
      // upstream sent something that isn't JSON — fall back to the generic message.
    }
    return NextResponse.json({ message }, { status: upstream.status || 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
