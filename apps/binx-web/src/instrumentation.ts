/**
 * instrumentation.ts - Server/edge error reporting bootstrap
 *
 * Next's instrumentation hook. register() runs once, before any other
 * module, in both the Node server runtime and the edge runtime. Sentry is
 * cleanly off whenever NEXT_PUBLIC_SENTRY_DSN is unset (local dev, CI),
 * mirroring the binx-api SENTRY_DSN pattern in core/config.py. The DSN is a
 * NEXT_PUBLIC_* var (not a server-only secret) so the one value covers both
 * this file and instrumentation-client.ts. Sentry DSNs are meant to be
 * public; they only identify which project events land in.
 *
 * onRequestError reports every server-side error twice over, on purpose:
 * to Sentry, and to the Binx admin error log (/admin/errors) via
 * lib/error-reporting-server.ts. The log works whether or not Sentry is on.
 *
 * @module apps/binx-web/src/instrumentation.ts
 * @author Binx.io
 */
import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

import { ENVIRONMENT, RELEASE } from "@/lib/errors";

const SENTRY_ON = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  if (!SENTRY_ON) {
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    // Error tracking first, not APM. Kept low since every sampled trace is
    // billed the same as an error event.
    tracesSampleRate: 0.1,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  let sentryEventId: string | undefined;
  if (SENTRY_ON) {
    Sentry.captureRequestError(error, request, context);
    sentryEventId = Sentry.lastEventId();
  }

  // Node only: the reporter reads cookies and IP headers itself. Imported
  // lazily so the edge bundle never pulls in node:crypto (lib/client-ip.ts).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportServerError } = await import("@/lib/error-reporting-server");
    await reportServerError(error, request, context, sentryEventId);
  }
};
