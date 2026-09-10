/**
 * route.ts - Message Attachment Download
 *
 * Proxies a message attachment's bytes from binx-api. Downloads can't hit
 * binx-api directly from the browser (no bearer token), so this reads the
 * session cookie server-side, attaches the token, and streams the response
 * back — same shape as the task-file download route.
 *
 * @module apps/binx-web/src/app/api/messages/[agencyId]/[conversationId]/messages/[messageId]/attachments/[attachmentId]/route.ts
 * @route GET /api/messages/{agencyId}/{conversationId}/messages/{messageId}/attachments/{attachmentId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{
    agencyId: string;
    conversationId: string;
    messageId: string;
    attachmentId: string;
  }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, conversationId, messageId, attachmentId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(
      `/agencies/${agencyId}/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}/download`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "arraybuffer" },
    );

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "application/octet-stream"),
        "Content-Disposition": String(upstream.headers["content-disposition"] ?? "attachment"),
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const data =
        error.response.data instanceof ArrayBuffer
          ? JSON.parse(Buffer.from(error.response.data).toString("utf-8"))
          : error.response.data;
      const message = extractDetailMessage(data, "Unable to download attachment");
      return NextResponse.json({ message }, { status: error.response.status });
    }

    const message = error instanceof AuthApiError ? error.message : "Unable to download attachment";
    return NextResponse.json({ message }, { status: 500 });
  }
}
