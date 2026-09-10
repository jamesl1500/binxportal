/**
 * MarketingHeader.tsx
 *
 * Sticky top bar for the public site: wordmark, primary nav, and the two
 * calls to action (Sign in / Get started). Client component for the active-
 * link highlight and the mobile disclosure.
 *
 * @module apps/binx-web/src/components/marketing/MarketingHeader/MarketingHeader.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { MARKETING_NAV, SITE } from "@/lib/site";

import styles from "./MarketingHeader.module.scss";

const MarketingHeader = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} onClick={() => setOpen(false)}>
          <span className={styles.brandMark} aria-hidden="true" />
          {SITE.name}
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              data-active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Link href="/auth/login" className={styles.signIn}>
            Sign in
          </Link>
          <Link href="/auth/signup" className={styles.cta}>
            Get started
          </Link>
        </div>

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div className={styles.mobilePanel}>
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.mobileLink} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className={styles.mobileActions}>
            <Link href="/auth/login" className={styles.signIn} onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/auth/signup" className={styles.cta} onClick={() => setOpen(false)}>
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default MarketingHeader;
