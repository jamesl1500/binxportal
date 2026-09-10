/**
 * route.ts - Project File Download
 *
 * Proxies a project file's bytes from binx-api. Downloads can't hit binx-api
 * directly from the browser — there's no bearer token to send there, only
 * this app's own httpOnly session cookie. This route reads that cookie
 * server-side (via `getAccessToken`), attaches the bearer token, and streams
 * binx-api's response back — the same "server holds the token, browser holds
 * the session cookie" split every other authenticated call in this app uses.
 *
 * @module apps/binx-web/src/app/api/projects/[agencyId]/[projectId]/files/[fileId]/route.ts
 * @author Binx.io
 * @route GET /api/projects/{agencyId}/{projectId}/files/{fileId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ agencyId: string; projectId: string; fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, projectId, fileId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(
      `/agencies/${agencyId}/projects/${projectId}/files/${fileId}/download`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "arraybuffer" },
    );

    return new NextResponse(upstream.data, {
      status: 200,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "application/octet-stream"),
        "Content-Disposition": String(upstream.headers["content-disposition"] ?? "attachment"),
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      // The failed response body is also an ArrayBuffer (responseType above
      // applies to every response, error or not) — decode it back to JSON to
      // read binx-api's { detail: ... } the normal way.
      const data =
        error.response.data instanceof ArrayBuffer
          ? JSON.parse(Buffer.from(error.response.data).toString("utf-8"))
          : error.response.data;
      const message = extractDetailMessage(data, "Unable to download file");
      return NextResponse.json({ message }, { status: error.response.status });
    }

    const message = error instanceof AuthApiError ? error.message : "Unable to download file";
    return NextResponse.json({ message }, { status: 500 });
  }
}
