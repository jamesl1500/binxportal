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

import { marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "For branding agencies";
const DESCRIPTION =
  "A workspace for branding agencies: a canvas for presenting brand concepts, a portal that delivers final assets and guidelines properly, and invoicing that matches project-based work.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/for/branding-agencies" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/for/branding-agencies"),
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

const FAQ = [
  {
    q: "Can we put our own branding on the client portal?",
    a: "Yes — the portal carries your agency's name and look, not Binx's. For a brand engagement, that matters as much as the work itself.",
  },
  {
    q: "Does the canvas work for moodboards and logo directions, not just tasks?",
    a: "Yes — it's a general shared surface, not a task-only board. Pin concepts, palettes and directions and the client can react and comment directly on them.",
  },
  {
    q: "Is there a free plan to try it on a real brand project?",
    a: "Yes — no card, no time limit, capped on clients and projects so you can run a real engagement through it end to end before deciding.",
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

const BrandingAgenciesPage = () => {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

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
            Comparing client-portal tools? See the{" "}
            <Link href="/alternatives/copilot-assembly">Copilot &amp; Assembly alternative</Link> page, or{" "}
            <Link href="/pricing">check the plans</Link>.
          </p>
        </div>
      </section>

      <MarketingCta heading="Present your next concept properly." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default BrandingAgenciesPage;
