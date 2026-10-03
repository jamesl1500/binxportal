/**
 * instrumentation-client.ts - Browser Sentry bootstrap
 *
 * Runs in the browser before any other client code. Cleanly off whenever
 * NEXT_PUBLIC_SENTRY_DSN is unset — see instrumentation.ts for why this is a
 * NEXT_PUBLIC_* var rather than a server-only secret.
 *
 * @module apps/binx-web/src/instrumentation-client.ts
 * @author Binx.io
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
