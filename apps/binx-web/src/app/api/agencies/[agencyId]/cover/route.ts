/**
 * route.ts - Agency Cover Photo
 *
 * Proxies the agency cover image's bytes from binx-api — same reasoning as
 * the sibling logo route.
 *
 * @module apps/binx-web/src/app/api/agencies/[agencyId]/cover/route.ts
 * @route GET /api/agencies/{agencyId}/cover
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ agencyId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(`/agencies/${agencyId}/cover`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "image/png"),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const statusCode = axios.isAxiosError(error) && error.response ? error.response.status : 500;
    return NextResponse.json({ message: "No cover" }, { status: statusCode === 404 ? 404 : 500 });
  }
}
