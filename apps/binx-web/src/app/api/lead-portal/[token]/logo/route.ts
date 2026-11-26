/**
 * route.ts - Lead Portal Logo
 *
 * Proxies the agency's logo for a lead portal page. No session: the portal
 * token scopes it, and binx-api 404s when the portal is off or the agency has
 * no logo. Inline (it's an <img>), through the same hardening as every
 * stored-file route.
 *
 * @module apps/binx-web/src/app/api/lead-portal/[token]/logo/route.ts
 * @route GET /api/lead-portal/{token}/logo
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { apiPath, DAILY_CACHE, fileResponseHeaders } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/lead-portal/${token}/logo`, { responseType: "arraybuffer" });
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, {
        fallbackType: "image/png",
        defaultDisposition: "inline",
        cacheControl: DAILY_CACHE,
      }),
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No logo" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
