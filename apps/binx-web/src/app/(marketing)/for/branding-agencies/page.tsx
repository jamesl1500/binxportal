/**
 * page.tsx - Binx for branding agencies
 *
 * Use-case landing page for the "branding agencies" segment. Leans on the
 * client portal for a polished delivery experience and the canvas for
 * moodboards/brand concept presentation.
 *
 * @module apps/binx-web/src/app/(marketing)/for/branding-agencies/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { FileStack, PanelsTopLeft, Receipt, Users } from "lucide-react";

import { SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

export const metadata: Metadata = {
  title: "Binx for branding agencies",
  description:
    "A workspace for branding agencies: a canvas for presenting brand concepts, a portal that delivers final assets and guidelines properly, and invoicing that matches project-based work.",
  alternates: { canonical: "/for/branding-agencies" },
};

const CAPABILITIES = [
  {
    icon: PanelsTopLeft,
    title: "Present concepts, not attachments",
    text: "Lay out logo directions, palettes and moodboards on a shared canvas the client can react and comment on directly — a presentation that stays live, not a PDF that goes stale.",
  },
  {
    icon: FileStack,
    title: "A proper final delivery",
    text: "Guidelines, logo files and brand assets live on the project and in the client's portal — organised, versioned, and still there a year later when they need the file again.",
  },
  {
    icon: Users,
    title: "A portal that looks considered",
    text: "Branded to your agency, not a generic tool — the portal itself is part of the impression a brand engagement leaves.",
  },
  {
    icon: Receipt,
    title: "Invoice the way brand work is sold",
    text: "Deposit up front, milestone payments through the project, final invoice on delivery — your terms, tracked against the same engagement.",
  },
];

const BrandingAgenciesPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>For branding agencies</span>
            <h1 className={styles.h1}>A brand engagement deserves a workspace, not a folder.</h1>
            <p className={styles.lead}>
              {SITE.name} gives a branding agency a live canvas for presenting concepts, a portal that delivers the
              final brand properly, and invoicing that matches how project-based brand work is actually sold.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/features" className={styles.btnGhost}>
                See everything it does
              </Link>
            </div>
            <p className={styles.heroNote}>Free plan available · no card required.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Built around the work</span>
            <h2 className={styles.h2}>From first concept to final brand delivery.</h2>
          </div>
          <div className={styles.grid}>
            {CAPABILITIES.map(({ icon: Icon, title, text }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardText}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>Client experience</span>
              <h2 className={styles.h3}>The last impression matters as much as the first.</h2>
              <p className={styles.leadOnDark}>
                A client who gets their finished brand in a branded, organised portal remembers that — and it&apos;s
                the same portal that made the concept review painless three months earlier.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingCta heading="Present your next concept properly." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default BrandingAgenciesPage;
