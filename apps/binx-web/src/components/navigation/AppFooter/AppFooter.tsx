/**
 * AppFooter.tsx
 *
 * Slim footer for the authenticated app area (dashboard and everything
 * under it): copyright, legal links, and a support contact — the staff
 * counterpart to components/marketing/MarketingFooter.
 *
 * @module apps/binx-web/src/components/navigation/AppFooter/AppFooter.tsx
 * @author Binx.io
 */
import Link from "next/link";

import { SITE, STATUS_URL } from "@/lib/site";

import styles from "./AppFooter.module.scss";

const AppFooter = () => {
  return (
    <footer className={styles.footer}>
      <span className={styles.copyright}>
        &copy; {new Date().getFullYear()} {SITE.legalName}
      </span>

      <nav className={styles.links} aria-label="Legal and support">
        <Link href="/privacy" className={styles.link}>
          Privacy
        </Link>
        <Link href="/terms" className={styles.link}>
          Terms
        </Link>
        <Link href="/contact" className={styles.link}>
          Support
        </Link>
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Status
        </a>
      </nav>
    </footer>
  );
};

export default AppFooter;
