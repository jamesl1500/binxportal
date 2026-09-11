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

import { MARKETING_NAV, SEO_LANDING_PAGES, SITE_URL, USE_CASE_PAGES } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

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
  ];
}
