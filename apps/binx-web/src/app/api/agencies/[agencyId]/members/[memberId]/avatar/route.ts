/**
 * route.ts - Member Avatar
 *
 * Proxies a teammate's avatar bytes from binx-api, for anywhere in the team
 * UI (roster, member drawer, profile page). Same shape as
 * app/api/agencies/[agencyId]/logo/route.ts, agency-and-member-scoped.
 *
 * @module apps/binx-web/src/app/api/agencies/[agencyId]/members/[memberId]/avatar/route.ts
 * @route GET /api/agencies/{agencyId}/members/{memberId}/avatar
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { apiPath, fileResponseHeaders } from "@/lib/file-proxy";

interface RouteParams {
  params: Promise<{ agencyId: string; memberId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, memberId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(apiPath`/agencies/${agencyId}/members/${memberId}/avatar`, {
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
    return NextResponse.json({ message: "No avatar" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
