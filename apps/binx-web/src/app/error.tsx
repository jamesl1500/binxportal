/**
 * Error Page
 *
 * Root error boundary for uncaught exceptions. Renders in place of the
 * crashed segment whenever a Server or Client Component throws during
 * rendering (the site-wide 500 page).
 *
 * @module apps/binx-web/src/app/error.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { reportClientError } from "@/lib/error-reporting";

import styles from "./error.module.scss";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

const ErrorPage = ({ error, retry }: ErrorPageProps) => {
  // The Binx error-log reference ("7F3A9C21"), once the report is stored:
  // what support asks for and looks up in /admin/errors.
  const [reference, setReference] = useState<string>();

  useEffect(() => {
    console.error(error);
    let current = true;
    void reportClientError(error, { source: "error-boundary" }).then((ref) => {
      if (current) setReference(ref);
    });
    return () => {
      current = false;
    };
  }, [error]);

  return (
    <div className={styles.root}>
      {/* A page that fails after streaming has started is already sent with
          a 200, so keep crawlers from indexing this in its place. React
          hoists the tag into <head>; the strictest robots value wins. */}
      <meta name="robots" content="noindex" />
      <div className={styles.content}>
        <p className={styles.code}>500</p>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.subtitle}>
          An unexpected error occurred on our end. Try again, or head back home.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => retry()}
          >
            Try again
          </button>
          <Link href="/" className={styles.secondaryAction}>
            Return home
          </Link>
        </div>

        {(reference || error.digest) && (
          <p className={styles.digest}>
            Reference: {reference ?? error.digest}
          </p>
        )}
      </div>
    </div>
  );
};

export default ErrorPage;
