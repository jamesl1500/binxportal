/**
 * consent.ts
 *
 * The visitor's analytics-cookie choice on the marketing site, shared by the
 * cookie banner (components/marketing/CookieConsent) and the Google Tag
 * Manager bootstrap (components/marketing/GoogleTagManager).
 *
 * The choice is kept in a first-party cookie, not localStorage, so GTM's
 * inline bootstrap can read it synchronously and apply it *before* the
 * container loads: a returning visitor who declined never has an analytics
 * hit sent, not even the first page view. The cookie itself is strictly
 * necessary (it only records the choice), so it doesn't need consent.
 *
 * Safe in Client Components; every function no-ops on the server.
 *
 * @module apps/binx-web/src/lib/consent.ts
 */

export type ConsentChoice = "granted" | "denied";

export const CONSENT_COOKIE = "binx_consent";
/** How long a choice lasts before the banner asks again (about 6 months). */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;
/** Fired on window when the choice changes or "Cookie settings" is clicked. */
export const CONSENT_EVENT = "binx:consent";

/**
 * Where analytics stays off until the visitor opts in (Consent Mode
 * `region` codes): the EEA, the UK and Switzerland. Everywhere else it's on
 * by default, and the banner still lets anyone turn it off.
 */
export const OPT_IN_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
] as const;

type Gtag = (...args: unknown[]) => void;

/** The stored choice, or null when the visitor hasn't made one. */
export function readConsent(cookie: string = typeof document === "undefined" ? "" : document.cookie): ConsentChoice | null {
  const match = new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=(granted|denied)(?:;|$)`).exec(cookie);
  return match ? (match[1] as ConsentChoice) : null;
}

/** Stores the choice, tells Google Tag Manager, and notifies listeners. */
export function saveConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  gtag?.("consent", "update", { analytics_storage: choice });
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { choice } }));
}

/** Reopens the banner (the footer's "Cookie settings" link). */
export function openConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { open: true } }));
}
