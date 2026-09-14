/**
 * route.ts - Own Avatar
 *
 * Proxies the signed-in user's avatar bytes from binx-api. The browser has
 * no bearer token for binx-api, so this reads the session cookie
 * server-side, attaches the token, and streams the image back — same shape
 * as app/api/agencies/[agencyId]/logo/route.ts.
 *
 * @module apps/binx-web/src/app/api/users/me/avatar/route.ts
 * @route GET /api/users/me/avatar
 */
import axios from "axios";
import { NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>("/users/me/avatar", {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "image/png"),
        // The URL is cache-busted with ?v=<version> by the caller, so the
        // bytes for a given URL never change — safe to cache hard.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No avatar" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
