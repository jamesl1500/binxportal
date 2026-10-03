/**
 * instrumentation.ts - Server/edge Sentry bootstrap
 *
 * Next's instrumentation hook — register() runs once, before any other
 * module, in both the Node server runtime and the edge runtime. Sentry is
 * cleanly off whenever NEXT_PUBLIC_SENTRY_DSN is unset (local dev, CI),
 * mirroring the binx-api SENTRY_DSN pattern in core/config.py. The DSN is a
 * NEXT_PUBLIC_* var (not a server-only secret) so the one value covers both
 * this file and instrumentation-client.ts — Sentry DSNs are meant to be
 * public, they only identify which project events land in.
 *
 * @module apps/binx-web/src/instrumentation.ts
 * @author Binx.io
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    // Error tracking first, not APM — kept low since every sampled trace is
    // billed the same as an error event.
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
