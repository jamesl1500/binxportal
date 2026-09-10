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
  legalName: "Binx.io",
  /** ~55 chars — used as the homepage <title>. */
  title: "Binx — the operating system for creative agencies",
  tagline: "Run the whole agency from one place.",
  /** ~155 chars — default meta description. */
  description:
    "Binx brings leads, clients, projects, files, invoicing and a live client portal into one calm workspace — so your agency spends its time on the work, not the wrangling.",
  url: SITE_URL,
  ogImageAlt: "Binx — the operating system for creative agencies",
  twitter: "@binxhq",
  email: "hello@binx.io",
  keywords: [
    "agency management software",
    "creative agency operations",
    "client portal",
    "agency CRM",
    "project management for agencies",
    "agency invoicing",
    "studio management",
  ],
} as const;

/** Primary marketing nav — also drives the sitemap. */
export const MARKETING_NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
