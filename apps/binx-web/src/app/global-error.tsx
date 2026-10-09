/**
 * global-error.tsx - Root error boundary
 *
 * The App Router only calls this for errors thrown while rendering the root
 * layout itself (a segment-level error.tsx handles everything else) — rare,
 * but when it fires it replaces <html>/<body> entirely, so it needs its own.
 * Reports to Sentry (a no-op when NEXT_PUBLIC_SENTRY_DSN is unset — see
 * lib/sentry-client.ts).
 *
 * @module apps/binx-web/src/app/global-error.tsx
 * @author Binx.io
 */
"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/sentry-client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error);
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
