/**
 * page.tsx - Binx for design studios
 *
 * Use-case landing page for the "design studios" segment already named on
 * the homepage trust bar. Leans on the canvas and file versioning — the
 * parts of Binx a visual studio actually lives in day to day.
 *
 * @module apps/binx-web/src/app/(marketing)/for/design-studios/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { FileStack, LayoutGrid, PanelsTopLeft, Receipt } from "lucide-react";

import { SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

export const metadata: Metadata = {
  title: "Binx for design studios",
  description:
    "A workspace for design studios: a shared canvas for reviewing concepts with clients, versioned files on every project, and a portal for sign-off — without a separate review tool.",
  alternates: { canonical: "/for/design-studios" },
};

const CAPABILITIES = [
  {
    icon: PanelsTopLeft,
    title: "Concepts on a shared canvas",
    text: "Pin drafts, moodboards and revisions to a project canvas the client can see and comment on directly — no separate review tool, no screenshots in an email thread.",
  },
  {
    icon: FileStack,
    title: "Files that stay attached to the work",
    text: "Every asset lives on the project it belongs to. Clients see exactly the files you choose, in the same place as everything else about that project.",
  },
  {
    icon: LayoutGrid,
    title: "A board for every stage",
    text: "Discovery, concepts, revisions, delivery — task lists and assignees that match how a design project actually moves, visible to the whole studio.",
  },
  {
    icon: Receipt,
    title: "Invoice on your terms",
    text: "Deposit, milestone, or on-delivery — your numbering and terms, billed from the same project the work happened in.",
  },
];

const DesignStudiosPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>For design studios</span>
            <h1 className={styles.h1}>Review work with clients where the work actually lives.</h1>
            <p className={styles.lead}>
              {SITE.name} gives a design studio one place for concepts, revisions, files and sign-off — a canvas
              the client sees and comments on directly, not a separate tool bolted onto the project.
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
            <h2 className={styles.h2}>From first concept to final delivery.</h2>
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
              <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>Client review</span>
              <h2 className={styles.h3}>No more &quot;see attached&quot; emails.</h2>
              <p className={styles.leadOnDark}>
                A client&apos;s portal shows exactly the concepts and files you&apos;ve shared, with comments and
                reactions landing right on the piece they&apos;re about — sign-off happens where the work is, not
                buried in a reply-all thread.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingCta heading="Open a canvas for your next project." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default DesignStudiosPage;
