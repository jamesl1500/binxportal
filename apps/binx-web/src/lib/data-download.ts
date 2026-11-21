/**
 * data-download.ts
 *
 * Shared body of the two spreadsheet download routes (exports and import
 * templates): attach the session's bearer token, fetch the file from
 * binx-api, and stream it back as an attachment. Same "server holds the
 * token, browser holds the session cookie" split as the project-file
 * download routes.
 *
 * Server-only (reads the session).
 *
 * @module apps/binx-web/src/lib/data-download.ts
 */
import axios from "axios";
import { NextResponse } from "next/server";

import { api } from "@/lib/api";
import { extractDetailMessage, getAccessToken } from "@/lib/auth";
import { fileResponseHeaders, upstreamErrorBody } from "@/lib/file-proxy";

export async function proxySpreadsheetDownload(path: string, fallbackMessage: string): Promise<NextResponse> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  try {
    const upstream = await api.get<ArrayBuffer>(path, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
    });
    return new NextResponse(upstream.data, {
      status: 200,
      headers: fileResponseHeaders(upstream.headers, {
        fallbackType: "application/octet-stream",
        defaultDisposition: "attachment",
      }),
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const message = extractDetailMessage(upstreamErrorBody(error.response.data), fallbackMessage);
      return NextResponse.json({ message }, { status: error.response.status });
    }
    return NextResponse.json({ message: fallbackMessage }, { status: 500 });
  }
}

/** "csv" | "xlsx" from a query string, or null for anything else. */
export function spreadsheetFormat(value: string | null): "csv" | "xlsx" | null {
  if (value === null) return "csv";
  return value === "csv" || value === "xlsx" ? value : null;
}
