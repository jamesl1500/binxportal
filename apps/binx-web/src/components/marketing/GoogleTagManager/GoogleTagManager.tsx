/**
 * GoogleTagManager.tsx
 *
 * Loads the Google Tag Manager container on the public marketing site only.
 * The signed-in app, the client portal and the auth pages never load it, so
 * client names, record ids and other workspace data in their URLs and page
 * titles are never sent to Google.
 *
 * - The container id comes from NEXT_PUBLIC_GTM_ID, which is inlined at build
 *   time. Only the production build sets it (see .github/workflows/deploy.yml),
 *   so local dev, CI and staging send nothing. An id that isn't the
 *   `GTM-XXXXXXX` shape is ignored rather than interpolated into a script.
 * - Consent Mode defaults run before the container loads (see gtmBootstrap):
 *   analytics waits for an opt-in in the EEA, UK and Switzerland and is on
 *   elsewhere; advertising storage and ad personalization are always off,
 *   matching the privacy policy ("no advertising cookies"). The cookie
 *   banner (CookieConsent) records the visitor's choice and updates it.
 * - `afterInteractive` (the next/script default) loads GTM after hydration,
 *   so it doesn't hold up the first paint. GA4's enhanced measurement picks up
 *   client-side route changes from the History API.
 *
 * @module apps/binx-web/src/components/marketing/GoogleTagManager/GoogleTagManager.tsx
 */
import Script from "next/script";

import { CONSENT_COOKIE, OPT_IN_REGIONS } from "@/lib/consent";

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,12}$/;

/** The configured container id, or null when unset or malformed. */
export function gtmContainerId(raw: string | undefined = process.env.NEXT_PUBLIC_GTM_ID): string | null {
  const id = raw?.trim();
  return id && GTM_ID_PATTERN.test(id) ? id : null;
}

/**
 * The inline bootstrap, in order:
 * 1. Consent Mode defaults. In the opt-in regions (EEA, UK, Switzerland)
 *    analytics is off until the visitor accepts in the cookie banner;
 *    elsewhere it's on. Advertising storage and personalization are off
 *    everywhere.
 * 2. The visitor's saved choice from the consent cookie, if any, so it
 *    applies before the first page view is sent.
 * 3. Google's standard GTM loader.
 */
export function gtmBootstrap(id: string): string {
  const ads = "ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'";
  const regions = JSON.stringify(OPT_IN_REGIONS);
  return [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    `gtag('consent','default',{analytics_storage:'denied',${ads},region:${regions},wait_for_update:500});`,
    `gtag('consent','default',{analytics_storage:'granted',${ads}});`,
    String.raw`var c=document.cookie.match(/(?:^|;\s*)${CONSENT_COOKIE}=(granted|denied)(?:;|$)/);`,
    "if(c){gtag('consent','update',{analytics_storage:c[1]});}",
    "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});",
    "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';",
    "j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
    `})(window,document,'script','dataLayer',${JSON.stringify(id)});`,
  ].join("");
}

const GoogleTagManager = ({ containerId = gtmContainerId() }: { containerId?: string | null }) => {
  if (!containerId) return null;
  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {gtmBootstrap(containerId)}
      </Script>
      {/* GTM's no-JavaScript fallback. */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(containerId)}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
};

export default GoogleTagManager;
