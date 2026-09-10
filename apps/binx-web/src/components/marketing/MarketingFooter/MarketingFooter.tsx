/**
 * MarketingFooter.tsx
 *
 * Site footer for the public pages: wordmark + one-liner, three link columns,
 * and the legal strip.
 *
 * @module apps/binx-web/src/components/marketing/MarketingFooter/MarketingFooter.tsx
 * @author Binx.io
 */
import Link from "next/link";

import { SITE } from "@/lib/site";

import styles from "./MarketingFooter.module.scss";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/auth/signup", label: "Get started" },
      { href: "/auth/login", label: "Sign in" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/contact", label: "Privacy" },
      { href: "/contact", label: "Terms" },
    ],
  },
];

const MarketingFooter = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            {SITE.name}
          </div>
          <p className={styles.blurb}>{SITE.tagline}</p>
        </div>

        <div className={styles.columns}>
          {COLUMNS.map((column) => (
            <nav key={column.heading} className={styles.column} aria-label={column.heading}>
              <p className={styles.columnHeading}>{column.heading}</p>
              {column.links.map((link) => (
                <Link key={link.label} href={link.href} className={styles.columnLink}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className={styles.legal}>
        <span>
          &copy; {new Date().getFullYear()} {SITE.legalName}
        </span>
        <a href={`mailto:${SITE.email}`} className={styles.legalLink}>
          {SITE.email}
        </a>
      </div>
    </footer>
  );
};

export default MarketingFooter;
