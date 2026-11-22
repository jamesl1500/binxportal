/**
 * global-error.tsx - Root error boundary
 *
 * The App Router only calls this for errors thrown while rendering the root
 * layout itself (a segment-level error.tsx handles everything else) — rare,
 * but when it fires it replaces <html>/<body> entirely, so it needs its own.
 * Reports to Sentry (when NEXT_PUBLIC_SENTRY_DSN is set) and to the Binx
 * admin error log. See lib/error-reporting.ts.
 *
 * @module apps/binx-web/src/app/global-error.tsx
 * @author Binx.io
 */
"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/error-reporting";
import { SITE } from "@/lib/site";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    void reportClientError(error, { level: "fatal", source: "global-error" });
  }, [error]);

  return (
    <html lang="en">
      {/* Replaces the root layout, so its metadata is gone too. */}
      <head>
        <title>{`Something went wrong · ${SITE.name}`}</title>
        <meta name="robots" content="noindex" />
      </head>
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
