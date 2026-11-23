/**
 * page.tsx - Client portal unavailable
 *
 * What a client sees while their agency is on its 30-day deletion hold. It
 * must not call getPortalContext, which is what redirects here.
 *
 * @module apps/binx-web/src/app/portal-unavailable/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";

import { portalLogoutAction } from "@/app/(app)/actions";

import styles from "./page.module.scss";

export const metadata: Metadata = {
  title: "Portal unavailable · Binx",
  robots: { index: false, follow: false },
};

const PortalUnavailablePage = () => (
  <main className={styles.root}>
    <div className={styles.card}>
      <h1 className={styles.title}>This portal isn&apos;t available right now</h1>
      <p className={styles.text}>
        Your agency has paused access to its client portal. If you need
        anything from them, including invoices or files, please contact them
        directly.
      </p>
      <div className={styles.actions}>
        <Link href="/portal" className={styles.primary}>
          Try again
        </Link>
        <form action={portalLogoutAction}>
          <button type="submit" className={styles.secondary}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  </main>
);

export default PortalUnavailablePage;
