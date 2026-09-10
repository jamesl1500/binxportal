/**
 * robots.ts
 *
 * Crawlers may index the marketing site; everything behind auth (the app, the
 * client portal, the auth flow itself) is disallowed. Those areas also send
 * `robots: { index: false }` via their layout metadata — this is belt and
 * braces.
 *
 * @module apps/binx-web/src/app/robots.ts
 * @author Binx.io
 */
import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/portal", "/auth", "/onboarding", "/api", "/settings", "/account"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
