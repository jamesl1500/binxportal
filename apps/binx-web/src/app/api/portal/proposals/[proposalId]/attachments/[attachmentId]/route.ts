/**
 * route.ts - Proposal Attachment Download (portal)
 *
 * Proxies an attachment on one of the signed-in client contact's proposals
 * from binx-api's `GET /portal/proposals/{id}/attachments/{id}`, which 404s
 * for drafts and other clients' proposals.
 *
 * @module apps/binx-web/src/app/api/portal/proposals/[proposalId]/attachments/[attachmentId]/route.ts
 * @route GET /api/portal/proposals/{proposalId}/attachments/{attachmentId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage, getAccessToken } from "@/lib/auth";
import { apiPath, fileResponseHeaders, IMMUTABLE_CACHE, upstreamErrorBody } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ proposalId: string; attachmentId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { proposalId, attachmentId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/portal/proposals/${proposalId}/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, {
        fallbackType: "application/octet-stream",
        defaultDisposition: "attachment",
        cacheControl: IMMUTABLE_CACHE,
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
