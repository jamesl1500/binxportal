"use client";

/**
 * MarketingHeader.tsx
 *
 * The site's top bar for marketing and auth pages.
 *
 * - Transparent over the hero, then frosted with a soft shadow once the page
 *   scrolls (`data-scrolled`).
 * - A highlight pill slides between nav links as the pointer (or keyboard
 *   focus) moves across them, and settles back on the current page's link.
 * - On phones, the menu button morphs into a close icon and the panel
 *   unfolds with its links arriving in a short stagger; Escape closes it.
 *
 * All motion is CSS; under `prefers-reduced-motion` the pill jumps instead
 * of sliding and nothing else animates.
 *
 * @module apps/binx-web/src/components/marketing/MarketingHeader/MarketingHeader.tsx
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { MARKETING_NAV, SITE } from "@/lib/site";
import BinxMark from "@/components/BinxMark/BinxMark";

import styles from "./MarketingHeader.module.scss";

interface Pill {
  left: number;
  width: number;
  visible: boolean;
}

const HIDDEN_PILL: Pill = { left: 0, width: 0, visible: false };

const MarketingHeader = () => {
  const pathname = usePathname();
  // The menu remembers the path it was opened on and only counts as open
  // while that's still the current page, so any navigation closes it
  // without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = useCallback(
    (next: boolean | ((was: boolean) => boolean)) =>
      setOpenOn((prev) => {
        const was = prev === pathname;
        const now = typeof next === "function" ? next(was) : next;
        return now ? pathname : null;
      }),
    [pathname],
  );
  const [scrolled, setScrolled] = useState(false);
  const [pill, setPill] = useState<Pill>(HIDDEN_PILL);
  const navRef = useRef<HTMLElement>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Frost the bar once the page has scrolled a little. Passive, and state
  // only flips at the threshold, so this never re-renders on every scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const pillTo = useCallback((el: HTMLElement | null | undefined) => {
    if (!el) return setPill((p) => ({ ...p, visible: false }));
    setPill({ left: el.offsetLeft, width: el.offsetWidth, visible: true });
  }, []);

  // Rest the pill on the current page's link (or hide it when no nav link
  // matches, e.g. on the homepage).
  const restPill = useCallback(() => {
    pillTo(navRef.current?.querySelector<HTMLElement>('a[data-active="true"]'));
  }, [pillTo]);

  useEffect(() => {
    restPill();
    // Re-measure once web fonts settle (link widths change when they load).
    document.fonts?.ready.then(restPill).catch(() => undefined);
  }, [restPill, pathname]);

  return (
    <header className={styles.header} data-scrolled={scrolled || open}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <BinxMark className={styles.brandMark} />
          {SITE.name}
        </Link>

        <nav ref={navRef} className={styles.nav} aria-label="Primary" onMouseLeave={restPill}>
          <span
            className={styles.pill}
            aria-hidden="true"
            data-visible={pill.visible}
            style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
          />
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              data-active={isActive(item.href)}
              aria-current={isActive(item.href) ? "page" : undefined}
              onMouseEnter={(e) => pillTo(e.currentTarget)}
              onFocus={(e) => pillTo(e.currentTarget)}
              onBlur={restPill}
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
            Get started <ArrowRight aria-hidden="true" />
          </Link>
        </div>

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.burger} data-open={open} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {open && (
        <div id="marketing-mobile-menu" className={styles.mobilePanel}>
          {MARKETING_NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.mobileLink}
              data-active={isActive(item.href)}
              style={{ "--i": i } as React.CSSProperties}
              onClick={() => setOpen(false)}
            >
              {item.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
          <div className={styles.mobileActions} style={{ "--i": MARKETING_NAV.length } as React.CSSProperties}>
            <Link href="/auth/login" className={styles.signIn} onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/auth/signup" className={styles.cta} onClick={() => setOpen(false)}>
              Get started <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default MarketingHeader;
