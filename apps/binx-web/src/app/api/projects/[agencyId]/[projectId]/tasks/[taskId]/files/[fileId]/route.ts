/**
 * route.ts - Task File Download
 *
 * Proxies a task file's bytes from binx-api. Same reasoning as the sibling
 * project-file route (see app/api/projects/.../files/[fileId]/route.ts) —
 * downloads can't hit binx-api directly from the browser, so this reads the
 * session cookie server-side, attaches the bearer token, and streams
 * binx-api's response back.
 *
 * @module apps/binx-web/src/app/api/projects/[agencyId]/[projectId]/tasks/[taskId]/files/[fileId]/route.ts
 * @author Binx.io
 * @route GET /api/projects/{agencyId}/{projectId}/tasks/{taskId}/files/{fileId}
 */
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ agencyId: string; projectId: string; taskId: string; fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agencyId, projectId, taskId, fileId } = await params;

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(
      `/agencies/${agencyId}/projects/${projectId}/tasks/${taskId}/files/${fileId}/download`,
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
