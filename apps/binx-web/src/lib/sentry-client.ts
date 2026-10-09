/**
 * sentry-client.ts
 *
 * Loads the browser Sentry SDK lazily. The SDK is ~75 KB (gzipped) — more
 * than any other dependency on the page — and none of it is needed to render
 * or hydrate, so instead of sitting in every route's initial JS it's fetched
 * once the page has loaded and the browser is idle. Cleanly off (the chunk is
 * never requested) whenever NEXT_PUBLIC_SENTRY_DSN is unset.
 *
 * Nothing is lost by starting late: errors thrown before the SDK arrives are
 * queued by a pair of tiny listeners and reported once it's up, and Sentry
 * back-dates the page-load trace from the browser's own performance timings.
 *
 * @module apps/binx-web/src/lib/sentry-client.ts
 * @author Binx Portal
 */
type SentryModule = typeof import("@/lib/sentry-sdk-client");

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let sentry: SentryModule | undefined;
let loading: Promise<SentryModule> | undefined;

/** Fetches + initialises the SDK (once). `null` when Sentry isn't configured. */
export function loadSentry(): Promise<SentryModule> | null {
  if (!DSN) return null;
  loading ??= import("@/lib/sentry-sdk-client").then((mod) => {
    mod.init({
      dsn: DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: 0.1,
    });
    sentry = mod;
    return mod;
  });
  return loading;
}

/** Reports an error, loading the SDK right away if it isn't here yet. */
export function reportError(error: unknown): void {
  void loadSentry()?.then((mod) => mod.captureException(error));
}

/** Next's `onRouterTransitionStart` hook — a no-op until the SDK has loaded. */
export function captureRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
): void {
  sentry?.captureRouterTransitionStart(...args);
}

/**
 * Call once at startup: queues any early errors, then loads the SDK after
 * the page's `load` event when the browser is idle and replays the queue.
 */
export function startSentryWhenIdle(): void {
  if (!DSN || typeof window === "undefined") return;

  const early: unknown[] = [];
  const onError = (event: ErrorEvent) => early.push(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const start = () => {
    void loadSentry()?.then((mod) => {
      // The SDK's own global handlers take over from here.
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      for (const error of early) mod.captureException(error);
    });
  };
  const whenIdle = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 4000 });
    } else {
      setTimeout(start, 1500);
    }
  };

  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}
