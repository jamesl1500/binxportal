/**
 * route.ts - Proposal Template Attachment Download (staff)
 *
 * Proxies a proposal template's document from binx-api with the viewer's
 * bearer token (the browser can't send it to binx-api itself), hardened by
 * `lib/file-proxy` like every other stored-file route. Same shape as the
 * message attachment download route.
 *
 * @module apps/binx-web/src/app/api/proposal-templates/[agencyId]/[templateId]/attachments/[attachmentId]/route.ts
 * @route GET /api/proposal-templates/{agencyId}/{templateId}/attachments/{attachmentId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage, getAccessToken } from "@/lib/auth";
import { apiPath, fileResponseHeaders, IMMUTABLE_CACHE, upstreamErrorBody } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ agencyId: string; templateId: string; attachmentId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, templateId, attachmentId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(
      apiPath`/agencies/${agencyId}/proposal-templates/${templateId}/attachments/${attachmentId}/download`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "arraybuffer" },
    );
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, {
        fallbackType: "application/octet-stream",
        defaultDisposition: "attachment",
        // An attachment id always names the same bytes (files are replaced
        // by removing and re-adding, never edited in place).
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
