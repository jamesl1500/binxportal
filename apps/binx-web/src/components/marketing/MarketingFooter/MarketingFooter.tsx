/**
 * MarketingFooter.tsx
 *
 * Site footer for the public pages: wordmark + one-liner, three link columns,
 * and the legal strip.
 *
 * @module apps/binx-web/src/components/marketing/MarketingFooter/MarketingFooter.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  FEATURE_PAGES,
  SEO_LANDING_PAGES,
  SITE,
  STATUS_URL,
  USE_CASE_PAGES,
} from "@/lib/site";
import BinxMark from "@/components/BinxMark/BinxMark";
import { CookieSettingsButton } from "@/components/marketing/CookieConsent/CookieConsent";
import { gtmContainerId } from "@/components/marketing/GoogleTagManager/GoogleTagManager";

import styles from "./MarketingFooter.module.scss";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { href: "/features", label: "Features" },
        ...FEATURE_PAGES,
        { href: "/pricing", label: "Pricing" },
        { href: "/auth/signup", label: "Get started" },
        { href: "/auth/login", label: "Sign in" },
      ],
    },
    {
      heading: "Compare",
      // Not in the primary nav (it'd clutter the header) — these SEO landing
      // pages still need to be reachable by a real link, not just the
      // sitemap, so a crawler actually finds and credits them.
      links: [...SEO_LANDING_PAGES],
    },
    {
      heading: "Use cases",
      // Same reasoning as Compare above — before this, the only inbound link
      // to any /for/* page sitewide was the homepage trust bar.
      links: [...USE_CASE_PAGES],
    },
    {
      heading: "Company",
      links: [
        { href: "/about", label: "About" },
        { href: "/contact", label: "Contact" },
        { href: STATUS_URL, label: "Status" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { href: "/privacy", label: "Privacy" },
        { href: "/terms", label: "Terms" },
      ],
    },
  ];

const MarketingFooter = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <div className={styles.brand}>
            <BinxMark className={styles.brandMark} />
            {SITE.name}
          </div>
          <p className={styles.blurb}>{SITE.tagline}</p>
        </div>

        <div className={styles.columns}>
          {COLUMNS.map((column) => (
            <nav
              key={column.heading}
              className={styles.column}
              aria-label={column.heading}
            >
              <p className={styles.columnHeading}>{column.heading}</p>
              {column.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={styles.columnLink}
                >
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
        {gtmContainerId() && <CookieSettingsButton className={styles.legalButton} />}
        {/* Opens the studio's site in a new tab. `noopener` keeps it from
            reaching back into this page; no `noreferrer`, so Foundry Frame's
            analytics can see the visit came from Binx. */}
        <a href={SITE.parent.url} target="_blank" rel="noopener" className={styles.legalLink}>
          A {SITE.parent.name} Project
          <ArrowUpRight aria-hidden="true" />
          <span className={styles.srOnly}> (opens in a new tab)</span>
        </a>
      </div>
    </footer>
  );
};

export default MarketingFooter;
