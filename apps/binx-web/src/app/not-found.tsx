/**
 * Not Found Page
 *
 * Rendered for any unmatched route, or when a route segment calls
 * `notFound()`. Serves as the site-wide 404 page.
 *
 * @module apps/binx-web/src/app/not-found.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import styles from "./not-found.module.scss";

// Without this the root layout's `robots: index, follow` is emitted next to
// the `noindex` Next adds for a 404: two contradicting robots tags.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const NotFound = () => {
  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>This page doesn&apos;t exist</h1>
        <p className={styles.subtitle}>
          The page you&apos;re looking for may have been moved, renamed, or
          never existed.
        </p>

        <div className={styles.actions}>
          <Link href="/" className={styles.action}>
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
