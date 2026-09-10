/**
 * Error Page
 *
 * Root error boundary for uncaught exceptions. Renders in place of the
 * crashed segment whenever a Server or Client Component throws during
 * rendering (the site-wide 500 page).
 *
 * @module apps/binx-web/src/app/error.tsx
 * @author Binx.io
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";

import styles from "./error.module.scss";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

const ErrorPage = ({ error, retry }: ErrorPageProps) => {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <p className={styles.code}>500</p>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.subtitle}>
          An unexpected error occurred on our end. Try again, or head back home.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className={styles.secondaryAction}>
            Return home
          </Link>
        </div>

        {error.digest && <p className={styles.digest}>Reference: {error.digest}</p>}
      </div>
    </div>
  );
};

export default ErrorPage;
