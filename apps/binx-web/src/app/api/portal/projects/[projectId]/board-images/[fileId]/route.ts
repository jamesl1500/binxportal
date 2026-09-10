/**
 * route.ts - Portal Canvas Image
 *
 * Proxies a collaboration-canvas image's bytes from binx-api for a client
 * portal contact. The browser holds only this app's httpOnly session cookie;
 * this route reads it server-side, attaches the bearer token, and streams
 * binx-api's `/portal/projects/{projectId}/canvas/images/{fileId}` response
 * back — the same split the staff project-file proxy uses.
 *
 * @module apps/binx-web/src/app/api/portal/projects/[projectId]/board-images/[fileId]/route.ts
 * @route GET /api/portal/projects/{projectId}/board-images/{fileId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ projectId: string; fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { projectId, fileId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(`/portal/projects/${projectId}/canvas/images/${fileId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "application/octet-stream"),
        "Content-Disposition": String(upstream.headers["content-disposition"] ?? "inline"),
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const data =
        error.response.data instanceof ArrayBuffer
          ? JSON.parse(Buffer.from(error.response.data).toString("utf-8"))
          : error.response.data;
      const message = extractDetailMessage(data, "Unable to load image");
      return NextResponse.json({ message }, { status: error.response.status });
    }
    const message = error instanceof AuthApiError ? error.message : "Unable to load image";
    return NextResponse.json({ message }, { status: 500 });
  }
}
