/**
 * sitemap.ts
 *
 * The public marketing routes. Authenticated areas are intentionally absent —
 * they're disallowed in robots.ts and noindex'd in their layouts.
 *
 * @module apps/binx-web/src/app/sitemap.ts
 * @author Binx.io
 */
import type { MetadataRoute } from "next";

import { MARKETING_LAST_UPDATED, MARKETING_NAV, SEO_LANDING_PAGES, SITE_URL, USE_CASE_PAGES } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = MARKETING_LAST_UPDATED;

  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    ...MARKETING_NAV.map((item) => ({
      url: `${SITE_URL}${item.href}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: item.href === "/pricing" ? 0.9 : 0.7,
    })),
    ...[...SEO_LANDING_PAGES, ...USE_CASE_PAGES].map((item) => ({
      url: `${SITE_URL}${item.href}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...["/privacy", "/terms"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
