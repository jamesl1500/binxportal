/**
 * route.ts - Portal Logo
 *
 * Proxies the signed-in client contact's portal logo bytes from binx-api's
 * `GET /portal/logo` (the client's own logo, or the agency's as a
 * fallback). Same shape as the board-canvas-image portal proxy.
 *
 * @module apps/binx-web/src/app/api/portal/logo/route.ts
 * @route GET /api/portal/logo
 */
import axios from "axios";
import { NextResponse, type NextRequest } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { fileResponseHeaders, versionedImageCache } from "@/lib/file-proxy";

export async function GET(req: NextRequest) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>("/portal/logo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });

    return new NextResponse(upstream.data, {
      status: 200,
      // The layout busts the URL with ?v=<version>, so the bytes at a
      // versioned URL never change: cached for good, not re-fetched daily
      // on every page of the portal.
      headers: fileResponseHeaders(upstream.headers, { fallbackType: "image/png", defaultDisposition: "inline", cacheControl: versionedImageCache(req.url) }),
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No logo" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
