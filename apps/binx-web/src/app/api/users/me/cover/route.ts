/**
 * route.ts - Own Cover
 *
 * Proxies the signed-in user's cover image bytes from binx-api. Same shape
 * as ../avatar/route.ts.
 *
 * @module apps/binx-web/src/app/api/users/me/cover/route.ts
 * @route GET /api/users/me/cover
 */
import axios from "axios";
import { NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { fileResponseHeaders } from "@/lib/file-proxy";

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>("/users/me/cover", {
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
    return NextResponse.json({ message: "No cover" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
