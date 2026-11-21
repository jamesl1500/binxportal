/**
 * investors.ts
 *
 * The facts behind the /investors page that only the founders can supply:
 * the round, traction numbers, the team and what the money is for. Each
 * list is empty until it's filled in, and the page hides an empty section
 * rather than showing a placeholder, so nothing on the public page is a
 * made-up number.
 *
 * Update the numbers here when they change (monthly is plenty) and bump
 * MARKETING_LAST_UPDATED in site.ts so the sitemap's lastmod moves too.
 *
 * @module apps/binx-web/src/lib/investors.ts
 * @author Binx Portal
 */

import { SITE } from "@/lib/site";

export const INVESTORS_PATH = "/investors";

/** The round as it's described in the hero and the snapshot strip. */
export const ROUND = {
  stage: "Pre-seed",
  /** Shown as "Raising: {amount}" when set, e.g. "$750K on a SAFE". */
  amount: null as string | null,
};

/**
 * Headline traction, shown as a stat row. Use numbers you'd put in the deck
 * and can back up on a call, e.g. { value: "$4.2K", label: "MRR, growing 18% a month" }.
 */
export const TRACTION: readonly { value: string; label: string }[] = [];

/**
 * The founders and key people. `bio` is one or two sentences on why this
 * person can build this company; `href` is a LinkedIn or personal site.
 */
export const TEAM: readonly {
  name: string;
  role: string;
  bio: string;
  href?: string;
}[] = [];

/** Where the round goes, e.g. { label: "Go-to-market", detail: "...", share: 45 }. */
export const USE_OF_FUNDS: readonly {
  label: string;
  detail: string;
  /** Percentage of the round, 0–100. */
  share: number;
}[] = [];

/** The inbox investor emails go to, with the subject pre-filled. */
export const INVESTOR_EMAIL = SITE.email;
export const INVESTOR_MAILTO = `mailto:${INVESTOR_EMAIL}?subject=${encodeURIComponent(
  `Investing in ${SITE.name}`,
)}`;
