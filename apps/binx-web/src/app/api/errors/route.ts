/**
 * route.ts - Browser error reports
 *
 * Where lib/error-reporting.ts sends browser errors. Relays them to binx-api
 * (`POST /errors/report`) for the Binx admin error log, adding what the
 * browser can't: the signed-in user's token (from the httpOnly cookie) and
 * the visitor's IP, so binx-api's per-IP rate limit applies per visitor.
 *
 * Anyone can call this, so it trusts nothing. The body is size-capped,
 * reduced to the known fields, each one truncated, and `runtime` is forced
 * to "browser". The response is always 202: a failure to record an error
 * isn't something the page can act on.
 *
 * @module apps/binx-web/src/app/api/errors/route.ts
 * @route POST /api/errors
 */
import { NextRequest, NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { WebErrorReport } from "@/lib/errors";

const MAX_BODY_BYTES = 64 * 1024;

const LIMITS: Partial<Record<keyof WebErrorReport, number>> = {
  error_type: 255,
  message: 2000,
  stack: 20_000,
  path: 512,
  route: 255,
  route_type: 32,
  digest: 64,
  release: 100,
  environment: 32,
  sentry_event_id: 64,
  user_agent: 512,
};
const LEVELS = new Set(["warning", "error", "fatal"]);

/** Exported for the tests. */
export function sanitizeReport(input: unknown): WebErrorReport | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.message !== "string") return null;

  const report: WebErrorReport = {
    runtime: "browser",
    error_type: "Error",
    message: "",
    level: LEVELS.has(raw.level as string)
      ? (raw.level as WebErrorReport["level"])
      : "error",
  };
  for (const [field, limit] of Object.entries(LIMITS) as [
    keyof WebErrorReport,
    number,
  ][]) {
    const value = raw[field];
    if (typeof value === "string" && value.length > 0) {
      (report as unknown as Record<string, string>)[field] = value.slice(
        0,
        limit,
      );
    }
  }
  return report.message ? report : null;
}

const accepted = (reference: string | null = null) =>
  NextResponse.json({ reference }, { status: 202 });

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return accepted();

  let text: string;
  try {
    text = await req.text();
  } catch {
    return accepted();
  }
  if (text.length > MAX_BODY_BYTES) return accepted();

  let report: WebErrorReport | null;
  try {
    report = sanitizeReport(JSON.parse(text));
  } catch {
    report = null;
  }
  if (!report) {
    return NextResponse.json(
      { message: "Invalid error report" },
      { status: 400 },
    );
  }

  try {
    const token = await getAccessToken();
    const { data } = await api.post<{ reference: string | null }>(
      "/errors/report",
      report,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 3000,
      },
    );
    return accepted(data.reference);
  } catch {
    return accepted();
  }
}
