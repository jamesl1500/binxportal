/**
 * route.ts - Signed Proposal PDF (staff)
 *
 * Proxies binx-api's signed-record PDF for a proposal with the viewer's
 * bearer token, hardened by `lib/file-proxy` like every other file route.
 *
 * @module apps/binx-web/src/app/api/proposals/[agencyId]/[proposalId]/certificate/route.ts
 * @route GET /api/proposals/{agencyId}/{proposalId}/certificate
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage, getAccessToken } from "@/lib/auth";
import { apiPath, fileResponseHeaders, upstreamErrorBody } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ agencyId: string; proposalId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, proposalId } = await params;
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }
  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/agencies/${agencyId}/proposals/${proposalId}/certificate.pdf`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, { fallbackType: "application/pdf", defaultDisposition: "attachment" }),
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const message = extractDetailMessage(upstreamErrorBody(error.response.data), "Unable to download the PDF");
      return NextResponse.json({ message }, { status: error.response.status });
    }
    return NextResponse.json({ message: "Unable to download the PDF" }, { status: 500 });
  }
}
