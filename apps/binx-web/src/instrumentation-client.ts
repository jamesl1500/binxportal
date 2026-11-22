/**
 * instrumentation-client.ts - Browser error reporting bootstrap
 *
 * Runs in the browser before any other client code. Two things:
 *
 * - Sentry, cleanly off whenever NEXT_PUBLIC_SENTRY_DSN is unset (see
 *   instrumentation.ts for why that's a NEXT_PUBLIC_* var). Only scheduled
 *   here rather than imported: it loads once the page is idle, keeping it
 *   out of every route's initial JS (see lib/sentry-client.ts).
 * - The Binx admin error log's listeners for uncaught errors and unhandled
 *   rejections (lib/error-reporting.ts). Always on, and tiny.
 *
 * @module apps/binx-web/src/instrumentation-client.ts
 * @author Binx.io
 */
import { installGlobalErrorReporting } from "@/lib/error-reporting";
import {
  captureRouterTransitionStart,
  startSentryWhenIdle,
} from "@/lib/sentry-client";

installGlobalErrorReporting();
startSentryWhenIdle();

export const onRouterTransitionStart = captureRouterTransitionStart;
