/**
 * UseCaseShowcase.tsx
 *
 * "Built for the way small agencies actually work": one photo card per
 * use-case page (design studios, marketing teams, branding agencies,
 * freelance collectives). Photos are from Unsplash, self-hosted and
 * statically imported so Next generates the blur placeholder and hashed,
 * long-cacheable URLs — see src/assets/marketing/photos/CREDITS.md.
 *
 * Cards reveal with a stagger as they scroll in; on hover the photo slowly
 * zooms and the arrow nudges forward.
 *
 * @module apps/binx-web/src/components/marketing/UseCaseShowcase/UseCaseShowcase.tsx
 */
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import brandingAgencies from "@/assets/marketing/photos/branding-agencies.webp";
import designStudios from "@/assets/marketing/photos/design-studios.webp";
import freelanceCollectives from "@/assets/marketing/photos/freelance-collectives.webp";
import marketingTeams from "@/assets/marketing/photos/marketing-teams.webp";
import { USE_CASE_PAGES } from "@/lib/site";

import styles from "./UseCaseShowcase.module.scss";

const DETAILS: Record<(typeof USE_CASE_PAGES)[number]["href"], { photo: StaticImageData; alt: string; line: string }> =
  {
    "/for/design-studios": {
      photo: designStudios,
      alt: "A designer sketching wireframes on a tablet with a stylus.",
      line: "Feedback on the work itself, not in an email thread.",
    },
    "/for/marketing-teams": {
      photo: marketingTeams,
      alt: "A team planning a campaign around a wall of sticky notes.",
      line: "Campaigns, approvals and invoices in one place.",
    },
    "/for/branding-agencies": {
      photo: brandingAgencies,
      alt: "Colour swatches and palette studies spread across a desk.",
      line: "Present directions, get a clear yes, version by version.",
    },
    "/for/freelance-collectives": {
      photo: freelanceCollectives,
      alt: "A small crew working together on laptops around a shared table.",
      line: "A shared workspace that looks like one studio to clients.",
    },
  };

const UseCaseShowcase = () => (
  <section className={styles.section}>
    <div className={styles.head}>
      <span className={styles.eyebrow}>Who it&apos;s for</span>
      <h2 className={styles.title}>Built for the way small agencies actually work.</h2>
    </div>
    <ul className={styles.grid}>
      {USE_CASE_PAGES.map((page, i) => {
        const { photo, alt, line } = DETAILS[page.href];
        return (
          <li key={page.href} className={styles.item} style={{ "--i": i } as React.CSSProperties}>
            <Link href={page.href} className={styles.card}>
              <Image
                src={photo}
                alt={alt}
                placeholder="blur"
                sizes="(min-width: 1100px) 17rem, (min-width: 640px) 45vw, 92vw"
                className={styles.photo}
              />
              <span className={styles.shade} aria-hidden="true" />
              <span className={styles.body}>
                <span className={styles.label}>
                  {page.label}
                  <ArrowUpRight aria-hidden="true" />
                </span>
                <span className={styles.line}>{line}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  </section>
);

export default UseCaseShowcase;
