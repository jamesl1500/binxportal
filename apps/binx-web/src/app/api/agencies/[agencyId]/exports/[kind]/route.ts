/**
 * route.ts - Data export download
 *
 * Proxies `GET /agencies/{agencyId}/exports/{kind}?format=csv|xlsx` from
 * binx-api as a file download (see lib/data-download.ts). The kind and
 * format are checked against fixed lists before anything is forwarded.
 *
 * @module apps/binx-web/src/app/api/agencies/[agencyId]/exports/[kind]/route.ts
 * @route GET /api/agencies/{agencyId}/exports/{kind}
 */
import { NextRequest, NextResponse } from "next/server";

import { proxySpreadsheetDownload, spreadsheetFormat } from "@/lib/data-download";
import { apiPath } from "@/lib/file-proxy";
import { isExportKind } from "@/lib/imports-client";

interface RouteParams {
  params: Promise<{ agencyId: string; kind: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { agencyId, kind } = await params;
  const format = spreadsheetFormat(req.nextUrl.searchParams.get("format"));
  if (!isExportKind(kind) || format === null) {
    return NextResponse.json({ message: "Unknown export" }, { status: 404 });
  }
  return proxySpreadsheetDownload(
    `${apiPath`/agencies/${agencyId}/exports/${kind}`}?format=${format}`,
    "Unable to export",
  );
}
