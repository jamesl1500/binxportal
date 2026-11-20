/**
 * route.ts - Import template download
 *
 * Proxies `GET /agencies/{agencyId}/imports/{kind}/template?format=csv|xlsx`
 * from binx-api — a starter spreadsheet generated from the import's own
 * fields, so its headers always map automatically.
 *
 * @module apps/binx-web/src/app/api/agencies/[agencyId]/imports/[kind]/template/route.ts
 * @route GET /api/agencies/{agencyId}/imports/{kind}/template
 */
import { NextRequest, NextResponse } from "next/server";

import { proxySpreadsheetDownload, spreadsheetFormat } from "@/lib/data-download";
import { apiPath } from "@/lib/file-proxy";
import { isImportKind } from "@/lib/imports-client";

interface RouteParams {
  params: Promise<{ agencyId: string; kind: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { agencyId, kind } = await params;
  const format = spreadsheetFormat(req.nextUrl.searchParams.get("format"));
  if (!isImportKind(kind) || format === null) {
    return NextResponse.json({ message: "Unknown template" }, { status: 404 });
  }
  return proxySpreadsheetDownload(
    `${apiPath`/agencies/${agencyId}/imports/${kind}/template`}?format=${format}`,
    "Unable to download the template",
  );
}
