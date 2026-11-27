/**
 * route.ts - Signed Proposal PDF (share link)
 *
 * Proxies the signed-record PDF for the share link's recipient. No session:
 * the token alone scopes it. `private, no-store`, since the URL is a bearer
 * secret.
 *
 * @module apps/binx-web/src/app/api/proposals/public/[token]/certificate/route.ts
 * @route GET /api/proposals/public/{token}/certificate
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage } from "@/lib/auth";
import { apiPath, fileResponseHeaders, upstreamErrorBody } from "@/lib/file-proxy";
import { proposalAccessHeaders } from "@/lib/proposal-access";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/proposals/public/${token}/certificate.pdf`, {
      responseType: "arraybuffer",
      // Opens a proposal protected by an email code, once verified.
      headers: await proposalAccessHeaders(token),
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
