/**
 * error-reporting.ts
 *
 * Browser error reporting: every error goes to Sentry (when configured) and
 * to the Binx admin error log, through this app's own `/api/errors` route,
 * which relays to binx-api (the browser never calls binx-api directly).
 *
 * - {@link reportClientError}: for an error you've caught, e.g. in an error
 *   boundary. Resolves to the reference to show the person, if it was stored.
 * - {@link installGlobalErrorReporting}: catches what nobody caught
 *   (`window.onerror`, unhandled rejections). Called once, from
 *   instrumentation-client.ts.
 *
 * Built not to become a problem itself: noise is filtered (lib/errors.ts
 * `isNoise`), the same error is only sent once per page load, a page sends
 * at most {@link MAX_REPORTS_PER_PAGE}, and a failed send is dropped
 * silently.
 *
 * @module apps/binx-web/src/lib/error-reporting.ts
 * @author Binx Portal
 */
import {
  describeError,
  ENVIRONMENT,
  type ErrorDescription,
  isNoise,
  RELEASE,
  type WebErrorReport,
} from "@/lib/errors";
import { reportError as reportToSentry } from "@/lib/sentry-client";

export const ERRORS_ENDPOINT = "/api/errors";
export const MAX_REPORTS_PER_PAGE = 10;

const sent = new Set<string>();
let reportsThisPage = 0;

/** Test hook: forget what this page load has already sent. */
export function resetReportedErrors(): void {
  sent.clear();
  reportsThisPage = 0;
}

function shouldSend(description: ErrorDescription): boolean {
  if (isNoise(description)) return false;
  const key = `${description.errorType}|${description.message}`;
  if (sent.has(key) || reportsThisPage >= MAX_REPORTS_PER_PAGE) return false;
  sent.add(key);
  reportsThisPage += 1;
  return true;
}

async function sendToBinx(report: WebErrorReport): Promise<string | undefined> {
  try {
    const res = await fetch(ERRORS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      // Lets the report finish if the page is navigating away.
      keepalive: true,
      credentials: "same-origin",
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { reference?: string | null };
    return body.reference ?? undefined;
  } catch {
    return undefined;
  }
}

export interface ClientErrorOptions {
  level?: "warning" | "error" | "fatal";
  /** Where it happened, if not the current page ("error-boundary", …). */
  source?: string;
}

/**
 * Reports a caught error to Sentry and the Binx error log. Resolves to the
 * Binx reference ("7F3A9C21") to show the person, or undefined when it was
 * filtered, a repeat, or couldn't be stored. Never rejects.
 */
export async function reportClientError(
  error: unknown,
  { level = "error", source }: ClientErrorOptions = {},
): Promise<string | undefined> {
  const description = describeError(error);
  if (!shouldSend(description)) return undefined;

  // Sentry first, so the Binx row can link to the same event.
  let sentryEventId: string | undefined;
  try {
    sentryEventId = await reportToSentry(
      error,
      source ? { binx_source: source } : undefined,
    );
  } catch {
    sentryEventId = undefined;
  }

  return sendToBinx({
    runtime: "browser",
    level,
    error_type: description.errorType,
    message: description.message,
    stack: description.stack,
    digest: description.digest,
    path:
      typeof window === "undefined"
        ? undefined
        : window.location.pathname.slice(0, 512),
    route_type: source,
    release: RELEASE,
    environment: ENVIRONMENT,
    sentry_event_id: sentryEventId,
    user_agent:
      typeof navigator === "undefined"
        ? undefined
        : navigator.userAgent.slice(0, 512),
  });
}

let installed = false;

/**
 * Sends anything nobody caught to the Binx error log. Sentry's own SDK
 * installs equivalent handlers when it loads (lib/sentry-client.ts), so
 * these send to Binx only; doing both here would double-report to Sentry.
 */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const send = (error: unknown, source: string) => {
    const description = describeError(error);
    if (!shouldSend(description)) return;
    void sendToBinx({
      runtime: "browser",
      error_type: description.errorType,
      message: description.message,
      stack: description.stack,
      path: window.location.pathname.slice(0, 512),
      route_type: source,
      release: RELEASE,
      environment: ENVIRONMENT,
      user_agent: navigator.userAgent.slice(0, 512),
    });
  };

  window.addEventListener("error", (event) =>
    send(event.error ?? event.message, "window.onerror"),
  );
  window.addEventListener("unhandledrejection", (event) =>
    send(event.reason, "unhandledrejection"),
  );
}
