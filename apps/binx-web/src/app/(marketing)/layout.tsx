/**
 * layout.tsx - Marketing
 *
 * Public site shell: the header, the page, the footer, plus site-wide
 * Organization + WebSite JSON-LD for rich results. These routes are the only
 * part of the app search engines should index, and the only part that loads
 * Google Tag Manager (see GoogleTagManager.tsx for why).
 *
 * @module apps/binx-web/src/app/(marketing)/layout.tsx
 * @author Binx Portal
 */
import { SITE, SITE_URL } from "@/lib/site";
import MarketingHeader from "@/components/marketing/MarketingHeader/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter/MarketingFooter";
import GoogleTagManager, { gtmContainerId } from "@/components/marketing/GoogleTagManager/GoogleTagManager";
import CookieConsent from "@/components/marketing/CookieConsent/CookieConsent";

import styles from "./marketing.module.scss";

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.legalName,
  url: SITE_URL,
  email: SITE.email,
  description: SITE.description,
  logo: `${SITE_URL}/icon-512.png`,
  sameAs: [`https://twitter.com/${SITE.twitter.replace("@", "")}`],
  parentOrganization: {
    "@type": "Organization",
    name: SITE.parent.name,
    url: SITE.parent.url,
  },
};

const siteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE_URL,
};

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className={styles.shell}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([orgJsonLd, siteJsonLd]),
        }}
      />
      <MarketingHeader />
      <main className={styles.main}>{children}</main>
      <MarketingFooter />
      <GoogleTagManager />
      {/* Only where there's analytics to consent to (production). */}
      {gtmContainerId() && <CookieConsent />}
    </div>
  );
};

export default MarketingLayout;
