/**
 * route.ts - Portal Conversation Participant Avatar
 *
 * Proxies the avatar of someone in a client-linked conversation for a client
 * portal contact. The browser holds only this app's httpOnly session cookie;
 * this route attaches the bearer token server-side and streams binx-api's
 * `/portal/conversations/{conversationId}/participants/{userId}/avatar`
 * response back. binx-api only serves photos of that conversation's
 * participants, so this can't be used to look up arbitrary users.
 *
 * @module apps/binx-web/src/app/api/portal/conversations/[conversationId]/participants/[userId]/avatar/route.ts
 * @route GET /api/portal/conversations/{conversationId}/participants/{userId}/avatar
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ conversationId: string; userId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { conversationId, userId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(
      `/portal/conversations/${conversationId}/participants/${userId}/avatar`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: "arraybuffer",
      },
    );

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "image/png"),
        // The URL is cache-busted with ?v=<version> by the caller, so the
        // bytes for a given URL never change — safe to cache hard.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No avatar" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
