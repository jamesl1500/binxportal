/**
 * global-error.tsx - Root error boundary
 *
 * The App Router only calls this for errors thrown while rendering the root
 * layout itself (a segment-level error.tsx handles everything else) — rare,
 * but when it fires it replaces <html>/<body> entirely, so it needs its own.
 * Reports to Sentry (a no-op when NEXT_PUBLIC_SENTRY_DSN is unset, since
 * instrumentation-client.ts never calls Sentry.init in that case).
 *
 * @module apps/binx-web/src/app/global-error.tsx
 * @author Binx.io
 */
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h1>Something went wrong</h1>
            <p>We&apos;ve been notified and are looking into it. Please try reloading the page.</p>
          </div>
        </div>
      </body>
    </html>
  );
}
