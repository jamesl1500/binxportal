/**
 * route.ts - Client Logo (staff)
 *
 * Proxies a client's portal-branding logo bytes from binx-api. The browser
 * has no bearer token for binx-api, so this reads the session cookie
 * server-side, attaches the token, and streams the image back — same shape
 * as the agency logo route.
 *
 * @module apps/binx-web/src/app/api/clients/[agencyId]/[clientId]/logo/route.ts
 * @route GET /api/clients/{agencyId}/{clientId}/logo
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { apiPath, fileResponseHeaders } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ agencyId: string; clientId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, clientId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/agencies/${agencyId}/clients/${clientId}/branding/logo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });

    return new NextResponse(upstream.data, {
      status: 200,
      // The URL is cache-busted with ?v=<version> by the caller, so the
      // bytes for a given URL never change — safe to cache hard.
      headers: fileResponseHeaders(upstream.headers, { fallbackType: "image/png", defaultDisposition: "inline", cacheControl: "private, max-age=86400" }),
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No logo" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
