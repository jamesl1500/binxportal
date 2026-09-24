/**
 * site.ts
 *
 * Single source of truth for the marketing/brand copy and URLs used across
 * metadata, JSON-LD, the sitemap, and the marketing pages themselves. Keeping
 * it here means a tagline or nav tweak is a one-file change.
 *
 * `NEXT_PUBLIC_SITE_URL` is the canonical origin (no trailing slash) — set it
 * per environment; it falls back to localhost for dev.
 *
 * @module apps/binx-web/src/lib/site.ts
 * @author Binx.io
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const SITE = {
  name: "Binx",
  legalName: "Binx",
  /** ~55 chars — used as the homepage <title>. */
  title: "Binx — the operating system for creative agencies",
  tagline: "Run the whole agency from one place.",
  /** ~155 chars — default meta description. */
  description:
    "Binx brings AI lead prospecting, proposals, clients, projects, invoicing and a live client portal into one calm workspace built for creative agencies.",
  url: SITE_URL,
  ogImageAlt: "Binx — the operating system for creative agencies",
  twitter: "@binxhq",
  email: "hello@binxportal.com",
  keywords: [
    "agency management software",
    "creative agency operations",
    "client portal",
    "agency CRM",
    "project management for agencies",
    "agency invoicing",
    "studio management",
    "proposal software for agencies",
    "AI lead generation",
    "client approval workflow",
    "agency dashboard",
  ],
} as const;

/**
 * When the marketing copy last materially changed — the sitemap's
 * `lastModified`. A per-request `new Date()` tells crawlers every page
 * changes on every fetch, which teaches them to ignore lastmod entirely.
 */
export const MARKETING_LAST_UPDATED = new Date("2026-09-24");

/** Shared pricing tiers — rendered on /pricing and summarised in JSON-LD offers. */
export const PLANS = [
  {
    name: "Free",
    price: 0,
    blurb: "For a solo operator or a first project.",
    features: ["1 agency workspace", "Up to 3 clients & 3 active projects", "25 leads", "3 team members", "Client portal, proposals & invoicing", "$10/mo of AI usage"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Starter",
    price: 49,
    blurb: "For a small studio finding its rhythm.",
    features: ["Everything in Free", "15 clients & 25 active projects", "250 leads", "10 team members", "Priority email support", "$50/mo of AI usage"],
    cta: "Start Starter",
    featured: false,
  },
  {
    name: "Pro",
    price: 149,
    blurb: "For an agency running many clients at once.",
    features: ["Everything in Starter", "60 clients & 150 active projects", "2,000 leads", "40 team members", "$200/mo of AI usage"],
    cta: "Start Pro",
    featured: true,
  },
  {
    name: "Scale",
    price: 399,
    blurb: "For a large team with no room for limits.",
    features: ["Everything in Pro", "Unlimited clients, projects & leads", "150 team members", "$750/mo of AI usage", "Onboarding help"],
    cta: "Start Scale",
    featured: false,
  },
] as const;

/** SoftwareApplication JSON-LD — lets search engines show Binx as an app with a price range. */
export function softwareApplicationJsonLd(featureList: readonly string[]) {
  const prices = PLANS.map((plan) => plan.price);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: SITE_URL,
    description: SITE.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    featureList: [...featureList],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: PLANS.length,
      url: `${SITE_URL}/pricing`,
    },
  };
}

/** BreadcrumbList JSON-LD for a page nested one level below Home. */
export function breadcrumbJsonLd(name: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

/** Primary marketing nav — also drives the sitemap. */
export const MARKETING_NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * SEO landing pages (alternative/comparison/use-case pages) — deliberately
 * not in MARKETING_NAV (they'd clutter the header), but still real pages
 * that belong in the sitemap and get linked from the footer and homepage.
 */
export const SEO_LANDING_PAGES = [
  { href: "/alternatives/dubsado", label: "Dubsado alternative" },
  { href: "/alternatives/honeybook", label: "HoneyBook alternative" },
  { href: "/alternatives/copilot-assembly", label: "Copilot & Assembly alternative" },
  { href: "/alternatives/bloom", label: "Bloom.io alternative" },
  { href: "/compare/notion-stripe-drive", label: "vs. Notion + Stripe + Drive" },
  { href: "/free-client-portal", label: "Free client portal" },
] as const;

/** The four segments named on the homepage trust bar — each gets its own use-case page. */
export const USE_CASE_PAGES = [
  { href: "/for/design-studios", label: "Design studios" },
  { href: "/for/marketing-teams", label: "Marketing teams" },
  { href: "/for/branding-agencies", label: "Branding agencies" },
  { href: "/for/freelance-collectives", label: "Freelance collectives" },
] as const;

/**
 * marketingOpenGraph
 *
 * A page's own `openGraph`/`twitter` metadata, so sharing e.g. /pricing on
 * Slack or X shows that page's title/description instead of the root
 * layout's homepage defaults — Next.js metadata doesn't deep-merge these
 * objects, so a page that sets `openGraph` at all must supply the whole
 * thing, `images` included: setting `openGraph` without `images` does NOT
 * fall back to the file-convention `opengraph-image` route (verified against
 * the actual rendered `<head>` — the auto-detected image only applies when a
 * route defines no `openGraph`/`twitter` of its own at all), so the shared
 * brand card (apps/binx-web/src/app/opengraph-image.tsx / twitter-image.tsx)
 * is referenced explicitly here instead.
 *
 * @function marketingOpenGraph
 */
export function marketingOpenGraph(title: string, description: string, path: string) {
  const url = `${SITE_URL}${path}`;
  const image = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: SITE.ogImageAlt };
  return {
    openGraph: {
      type: "website" as const,
      siteName: SITE.name,
      title,
      description,
      url,
      locale: "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      site: SITE.twitter,
      creator: SITE.twitter,
      images: [`${SITE_URL}/twitter-image`],
    },
  };
}
