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

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "For design studios";
const DESCRIPTION =
  "Binx for design studios: review concepts with clients on a shared canvas, collect approvals on each card, and keep versioned files on every project.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/for/design-studios" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/for/design-studios"),
};

const CAPABILITIES = [
  {
    icon: PanelsTopLeft,
    title: "Concepts on a shared canvas",
    text: "Pin drafts, moodboards and revisions to a project canvas the client can comment on, then request approval on a card and get a clear yes or a note on what to change. No separate review tool.",
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

const FAQ = [
  {
    q: "Does this replace our review/markup tool?",
    a: "For most studios, yes — the canvas is where concepts get pinned and commented on directly by the client, so a separate markup tool or screenshot-and-email thread isn't needed to get to sign-off.",
  },
  {
    q: "Can a client comment on a specific concept, not just the project as a whole?",
    a: "Yes — comments and reactions land on the individual piece they're about, right on the canvas, not buried in a reply-all thread.",
  },
  {
    q: "Is there a free plan we can try on a real project?",
    a: "Yes — no card, no time limit, capped on clients and projects so you can run a real concept review through it before deciding.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const DesignStudiosPage = () => {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd(TITLE, "/for/design-studios")]) }} />

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

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 className={styles.h2}>Before you switch.</h2>
          </div>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <div key={item.q} className={styles.faqItem}>
                <h3 className={styles.faqQ}>{item.q}</h3>
                <p className={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
          <p className={styles.faqRelated}>
            Coming from Bloom? See the <Link href="/alternatives/bloom">Bloom.io alternative</Link> page, or{" "}
            <Link href="/pricing">check the plans</Link>.
          </p>
        </div>
      </section>

      <MarketingCta heading="Open a canvas for your next project." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default DesignStudiosPage;
