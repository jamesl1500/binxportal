/**
 * instrumentation-client.ts - Browser Sentry bootstrap
 *
 * Runs in the browser before any other client code. Cleanly off whenever
 * NEXT_PUBLIC_SENTRY_DSN is unset — see instrumentation.ts for why this is a
 * NEXT_PUBLIC_* var rather than a server-only secret.
 *
 * Only schedules the SDK here rather than importing it: it loads once the
 * page is idle, keeping it out of every route's initial JS (see
 * lib/sentry-client.ts).
 *
 * @module apps/binx-web/src/instrumentation-client.ts
 * @author Binx.io
 */
import {
  captureRouterTransitionStart,
  startSentryWhenIdle,
} from "@/lib/sentry-client";

startSentryWhenIdle();

export const onRouterTransitionStart = captureRouterTransitionStart;
