/**
 * robots.ts
 *
 * Crawlers may index the marketing site; everything behind auth (the app, the
 * client portal, the auth flow itself) is disallowed. Those areas also send
 * `robots: { index: false }` via their layout metadata ((app)/layout.tsx,
 * (auth)/auth/layout.tsx, (auth)/onboarding/layout.tsx, (portal)/layout.tsx)
 * — this is belt and braces. The (app) segments below are every top-level
 * route under that group (`find src/app/\(app\) -maxdepth 1 -type d`) — keep
 * this list in sync if a new one is added, since it isn't derived from the
 * filesystem automatically.
 *
 * @module apps/binx-web/src/app/robots.ts
 * @author Binx.io
 */
import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const APP_SEGMENTS = [
  "account",
  "activity",
  "ai",
  "billing",
  "clients",
  "dashboard",
  "invoices",
  "leads",
  "messages",
  "notifications",
  "profile",
  "projects",
  "settings",
  "team",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...APP_SEGMENTS.map((segment) => `/${segment}`), "/portal", "/auth", "/onboarding", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
