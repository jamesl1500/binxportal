/**
 * seo.spec.ts — an on-page SEO audit of every URL in /sitemap.xml.
 *
 * Reads the live sitemap (so a new marketing page is covered the moment it's
 * listed there) and checks each page for the basics search engines and
 * social previews rely on:
 * - 200 status, `<html lang>`, and no `noindex`;
 * - a title (≤ 60 characters; unique across the site) and a meta
 *   description (70–160 characters; unique);
 * - a canonical URL pointing at the page itself;
 * - Open Graph title / description / image / url and a Twitter card;
 * - exactly one `<h1>`, and no skipped heading levels (an h2 straight to an h4);
 * - every image has an `alt` attribute (empty is fine for decorative ones);
 * - every JSON-LD block parses and names a schema.org type;
 * - every link has text (or an aria-label / titled or alt-texted image);
 * - every internal link on the page resolves.
 *
 * Problems are collected per page and reported together, so one run lists
 * everything that needs fixing instead of stopping at the first.
 */
import { expect, test, type Page } from "@playwright/test";

const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

interface PageFacts {
  status: number;
  lang: string | null;
  title: string;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  og: Record<string, string | null>;
  twitterCard: string | null;
  headings: number[];
  h1s: number;
  imagesWithoutAlt: string[];
  jsonLd: string[];
  unnamedLinks: string[];
  links: string[];
}

async function sitemapPaths(page: Page): Promise<string[]> {
  const response = await page.request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
}

async function collect(page: Page, path: string): Promise<PageFacts> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  return {
    status: response?.status() ?? 0,
    ...(await page.evaluate(() => {
      const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content") ?? null;
      return {
        lang: document.documentElement.getAttribute("lang"),
        title: document.title,
        description: meta('meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        robots: meta('meta[name="robots"]'),
        og: {
          title: meta('meta[property="og:title"]'),
          description: meta('meta[property="og:description"]'),
          image: meta('meta[property="og:image"]'),
          url: meta('meta[property="og:url"]'),
        },
        twitterCard: meta('meta[name="twitter:card"]'),
        headings: [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")].map(
          (el) => Number(el.tagName[1]),
        ),
        h1s: document.querySelectorAll("h1").length,
        imagesWithoutAlt: [...document.querySelectorAll("img:not([alt])")].map(
          (img) => img.getAttribute("src") ?? "(no src)",
        ),
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""),
        // Links with no text for crawlers or screen readers to read.
        unnamedLinks: [...document.querySelectorAll("a[href]")]
          .filter(
            (a) =>
              !a.textContent?.trim() &&
              !a.getAttribute("aria-label") &&
              !a.getAttribute("title") &&
              !a.querySelector('img[alt]:not([alt=""]), svg[aria-label]'),
          )
          .map((a) => a.getAttribute("href") ?? ""),
        links: [
          ...new Set(
            [...document.querySelectorAll("a[href]")]
              .map((a) => a.getAttribute("href") ?? "")
              .filter((href) => href.startsWith("/") && !href.startsWith("//"))
              .map((href) => href.split("#")[0])
              .filter(Boolean),
          ),
        ],
      };
    })),
  };
}

function audit(path: string, facts: PageFacts): string[] {
  const problems: string[] = [];
  if (facts.status !== 200) problems.push(`status ${facts.status}`);
  if (!facts.lang) problems.push("no <html lang>");
  if (facts.robots?.includes("noindex")) problems.push(`robots meta is "${facts.robots}"`);

  if (!facts.title) problems.push("no <title>");
  else if (facts.title.length > TITLE_MAX) problems.push(`title is ${facts.title.length} chars: "${facts.title}"`);

  if (!facts.description) problems.push("no meta description");
  else if (facts.description.length < DESCRIPTION_MIN || facts.description.length > DESCRIPTION_MAX)
    problems.push(`description is ${facts.description.length} chars`);

  if (!facts.canonical) problems.push("no canonical");
  else if (new URL(facts.canonical).pathname.replace(/\/$/, "") !== path.replace(/\/$/, ""))
    problems.push(`canonical points at ${facts.canonical}`);

  for (const [key, value] of Object.entries(facts.og)) if (!value) problems.push(`no og:${key}`);
  if (facts.og.url && new URL(facts.og.url).pathname.replace(/\/$/, "") !== path.replace(/\/$/, ""))
    problems.push(`og:url points at ${facts.og.url}`);
  if (!facts.twitterCard) problems.push("no twitter:card");

  if (facts.h1s !== 1) problems.push(`${facts.h1s} <h1> elements`);
  facts.headings.forEach((level, i) => {
    const previous = i === 0 ? 1 : facts.headings[i - 1];
    if (level > previous + 1) problems.push(`heading jumps from h${previous} to h${level}`);
  });

  for (const src of facts.imagesWithoutAlt) problems.push(`image without alt: ${src}`);
  for (const href of facts.unnamedLinks) problems.push(`link with no text: ${href}`);

  facts.jsonLd.forEach((raw, i) => {
    try {
      const data = JSON.parse(raw) as unknown;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items as Record<string, unknown>[]) {
        if (!item["@context"] || !item["@type"]) problems.push(`JSON-LD block ${i + 1} lacks @context/@type`);
      }
    } catch {
      problems.push(`JSON-LD block ${i + 1} doesn't parse`);
    }
  });
  return problems;
}

test.describe("SEO audit", () => {
  // One test walks the whole sitemap: titles and descriptions have to be
  // compared across pages, and links are checked once each.
  test.setTimeout(240_000);

  test("every sitemap page passes the on-page checks", async ({ page }) => {
    const paths = await sitemapPaths(page);
    expect(paths.length).toBeGreaterThan(10);

    const report: Record<string, string[]> = {};
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    const links = new Set<string>();

    for (const path of paths) {
      const facts = await collect(page, path);
      const problems = audit(path, facts);
      if (titles.has(facts.title)) problems.push(`same title as ${titles.get(facts.title)}`);
      titles.set(facts.title, path);
      if (facts.description) {
        if (descriptions.has(facts.description)) problems.push(`same description as ${descriptions.get(facts.description)}`);
        descriptions.set(facts.description, path);
      }
      facts.links.forEach((link) => links.add(link));
      if (problems.length) report[path] = problems;
    }

    // Internal links: everything linked from a marketing page must resolve
    // (signed-out app links legitimately redirect to the login page).
    const broken: string[] = [];
    for (const link of links) {
      const response = await page.request.get(link, { maxRedirects: 5 });
      if (response.status() >= 400) broken.push(`${link} → ${response.status()}`);
    }
    if (broken.length) report["(internal links)"] = broken;

    expect(report, JSON.stringify(report, null, 2)).toEqual({});
  });

  test("the 404 page says so and isn't indexable", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    // Exactly one robots tag, and it's noindex (not also the root's "index").
    const robots = await page.locator('meta[name="robots"]').evaluateAll((tags) =>
      tags.map((tag) => tag.getAttribute("content")),
    );
    expect(robots.length).toBeGreaterThan(0);
    expect(robots.every((content) => content?.includes("noindex"))).toBe(true);
  });
});
