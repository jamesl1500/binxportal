import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { MARKETING_LAST_UPDATED, SITE_URL } from "@/lib/site";

describe("sitemap", () => {
  it("uses a stable lastModified rather than the request time", () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toEqual(MARKETING_LAST_UPDATED);
    }
  });

  it("lists each URL once", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(`${SITE_URL}/features`);
    expect(urls).toContain(`${SITE_URL}/privacy`);
  });
});
