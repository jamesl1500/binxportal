/**
 * route.ts - Proposal Attachment Download (public share link)
 *
 * Proxies an attachment for the unauthenticated recipient of a proposal's
 * share link. No session: the opaque token alone scopes the request, same
 * as the public proposal page. binx-api 404s for drafts, unknown tokens and
 * agencies on their deletion hold. `private, no-store` because the URL is a
 * bearer secret, and a shared cache must never keep it.
 *
 * @module apps/binx-web/src/app/api/proposals/public/[token]/attachments/[attachmentId]/route.ts
 * @route GET /api/proposals/public/{token}/attachments/{attachmentId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage } from "@/lib/auth";
import { apiPath, fileResponseHeaders, upstreamErrorBody } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ token: string; attachmentId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token, attachmentId } = await params;

  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/proposals/public/${token}/attachments/${attachmentId}`, {
      responseType: "arraybuffer",
    });
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, {
        fallbackType: "application/octet-stream",
        defaultDisposition: "attachment",
      }),
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const message = extractDetailMessage(upstreamErrorBody(error.response.data), "Unable to download file");
      return NextResponse.json({ message }, { status: error.response.status });
    }
    return NextResponse.json({ message: "Unable to download file" }, { status: 500 });
  }
}
