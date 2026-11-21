/**
 * CookieConsent.tsx
 *
 * The marketing site's cookie banner, and the footer's "Cookie settings"
 * button that reopens it. Only rendered when Google Tag Manager is
 * configured (production): with no analytics there's nothing to consent to.
 *
 * - Shown until the visitor chooses; the choice lives in the `binx_consent`
 *   cookie (lib/consent.ts) and is applied to Consent Mode right away, and
 *   on later visits before GTM even loads (see GoogleTagManager.tsx).
 * - "Decline" is exactly as easy as "Accept": same size, same weight, side
 *   by side, as EU guidance on consent banners expects.
 * - A fixed card, not a page-wide bar, so it never shifts the layout
 *   (no CLS) and doesn't cover the hero's call to action on a phone.
 * - Not a modal: the page stays usable and focus isn't trapped. It's a
 *   labelled region, announced politely when it appears.
 * - Rendered in the browser only, because the server can't know the
 *   cookie's value for a statically rendered page.
 *
 * @module apps/binx-web/src/components/marketing/CookieConsent/CookieConsent.tsx
 */
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { CONSENT_EVENT, openConsentSettings, readConsent, saveConsent, type ConsentChoice } from "@/lib/consent";

import styles from "./CookieConsent.module.scss";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/** The stored choice; `undefined` during the server render and hydration. */
function useStoredConsent(): ConsentChoice | null | undefined {
  return useSyncExternalStore(subscribe, () => readConsent(), () => undefined);
}

const CookieConsent = () => {
  const stored = useStoredConsent();
  const [reopened, setReopened] = useState(false);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onEvent = (event: Event) => {
      if ((event as CustomEvent<{ open?: boolean }>).detail?.open) setReopened(true);
    };
    window.addEventListener(CONSENT_EVENT, onEvent);
    return () => window.removeEventListener(CONSENT_EVENT, onEvent);
  }, []);

  // When reopened from the footer, move focus into the banner so keyboard
  // and screen-reader users land on the choice they asked to change.
  useEffect(() => {
    if (reopened) acceptRef.current?.focus();
  }, [reopened]);

  const open = stored === null || reopened;
  if (stored === undefined || !open) return null;

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice);
    setReopened(false);
  };

  return (
    <section className={styles.banner} aria-label="Cookie preferences" aria-live="polite">
      <p className={styles.title}>Can we use analytics cookies?</p>
      <p className={styles.text}>
        They tell us which pages are useful so we can improve the site. No advertising cookies, ever. You can change
        this any time from the footer. <Link href="/privacy">Privacy policy</Link>
      </p>
      {stored && reopened && (
        <p className={styles.current}>
          Currently: analytics cookies are {stored === "granted" ? "allowed" : "off"}.
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => choose("denied")}>
          Decline
        </button>
        <button ref={acceptRef} type="button" className={styles.button} onClick={() => choose("granted")}>
          Accept
        </button>
      </div>
    </section>
  );
};

/** The footer link that reopens the banner. */
export const CookieSettingsButton = ({ className }: { className?: string }) => (
  <button type="button" className={className} onClick={openConsentSettings}>
    Cookie settings
  </button>
);

export default CookieConsent;
