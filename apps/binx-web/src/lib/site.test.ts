import { describe, expect, it } from "vitest";

import { marketingOpenGraph, SITE, SITE_URL } from "@/lib/site";

describe("marketingOpenGraph", () => {
  it("builds a full openGraph/twitter object with the page's own title, description and url", () => {
    const result = marketingOpenGraph("Pricing", "Simple plans that scale.", "/pricing");

    expect(result.openGraph).toMatchObject({
      type: "website",
      siteName: SITE.name,
      title: "Pricing",
      description: "Simple plans that scale.",
      url: `${SITE_URL}/pricing`,
      locale: "en_US",
    });
    expect(result.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Pricing",
      description: "Simple plans that scale.",
      site: SITE.twitter,
      creator: SITE.twitter,
    });
  });

  // A page that sets its own `openGraph` replaces the root layout's object
  // wholesale rather than merging into it — confirmed against the actual
  // rendered <head> — so the shared file-convention OG/Twitter images must
  // be referenced explicitly here or a page loses its share-card image
  // entirely.
  it("explicitly includes the shared opengraph-image/twitter-image routes", () => {
    const result = marketingOpenGraph("About", "About Binx.", "/about");

    expect(result.openGraph.images).toEqual([
      { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: SITE.ogImageAlt },
    ]);
    expect(result.twitter.images).toEqual([`${SITE_URL}/twitter-image`]);
  });
});
