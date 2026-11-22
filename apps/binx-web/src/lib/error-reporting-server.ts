/**
 * error-reporting-server.ts
 *
 * Next-server error reporting, called from instrumentation.ts's
 * `onRequestError` for every error thrown while rendering, in a route
 * handler, in a server action or in the proxy. Sentry gets them through
 * `Sentry.captureRequestError` there; this sends the same error to the Binx
 * admin error log via binx-api `POST /errors/report`.
 *
 * Skipped, so the log counts each real problem once:
 * - Next's control flow (`redirect()`, `notFound()`), which is thrown but
 *   isn't an error.
 * - Errors whose message carries a binx-api reference ("… Reference:
 *   7F3A9C21"). binx-api already recorded that failure; this is the page
 *   relaying it.
 *
 * Node runtime only. It reads the request's cookies and IP itself, since
 * `onRequestError` runs outside the request scope `next/headers` needs.
 *
 * @module apps/binx-web/src/lib/error-reporting-server.ts
 * @author Binx Portal
 */
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  resolveClientIp,
} from "@/lib/client-ip";
import {
  describeError,
  ENVIRONMENT,
  hasReference,
  RELEASE,
  type WebErrorReport,
} from "@/lib/errors";

/** The `request` and `context` Next passes to `onRequestError`. */
export interface RequestErrorInfo {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RequestErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
}

const NEXT_CONTROL_FLOW = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/;
const TIMEOUT_MS = 2000;

function header(info: RequestErrorInfo, name: string): string | undefined {
  const value = info.headers[name];
  return Array.isArray(value) ? value.join(", ") : value;
}

function cookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Exported for the tests: the report, or null when it shouldn't be sent. */
export function buildServerReport(
  error: unknown,
  info: RequestErrorInfo,
  context: RequestErrorContext,
  sentryEventId?: string,
): WebErrorReport | null {
  const description = describeError(error);
  if (description.digest && NEXT_CONTROL_FLOW.test(description.digest))
    return null;
  if (NEXT_CONTROL_FLOW.test(description.message)) return null;
  if (hasReference(description.message)) return null;

  // An API 4xx that reached the error boundary is a broken page, but less
  // urgent than a crash.
  const status = (error as { status?: unknown } | null)?.status;
  const level =
    typeof status === "number" && status < 500 ? "warning" : "error";

  return {
    runtime: "server",
    level,
    error_type: description.errorType,
    message: description.message,
    stack: description.stack,
    digest: description.digest,
    path: info.path.split("?")[0].slice(0, 512),
    method: info.method.slice(0, 10),
    route: context.routePath?.slice(0, 255),
    route_type: context.routeType?.slice(0, 32),
    release: RELEASE,
    environment: ENVIRONMENT,
    sentry_event_id: sentryEventId,
    user_agent: header(info, "user-agent")?.slice(0, 512),
  };
}

export async function reportServerError(
  error: unknown,
  info: RequestErrorInfo,
  context: RequestErrorContext,
  sentryEventId?: string,
): Promise<void> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  const report = buildServerReport(error, info, context, sentryEventId);
  if (!apiBase || !report) return;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token = cookieValue(header(info, "cookie"), ACCESS_TOKEN_COOKIE);
  if (token) headers.authorization = `Bearer ${token}`;

  // So binx-api's per-IP limit on this endpoint applies per visitor rather
  // than to this server as a whole (see lib/client-ip.ts).
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret) {
    const requestHeaders = new Headers();
    for (const [name, value] of Object.entries(info.headers)) {
      if (value !== undefined) {
        requestHeaders.set(
          name,
          Array.isArray(value) ? value.join(", ") : value,
        );
      }
    }
    const ip = resolveClientIp(requestHeaders, secret);
    if (ip) {
      headers[CLIENT_IP_HEADER] = ip;
      headers[PROXY_SECRET_HEADER] = secret;
    }
  }

  try {
    await fetch(`${apiBase}/errors/report`, {
      method: "POST",
      headers,
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // binx-api is down or slow. Sentry still has the error.
  }
}
