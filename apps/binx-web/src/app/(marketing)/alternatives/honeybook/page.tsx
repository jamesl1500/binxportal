/**
 * page.tsx - HoneyBook alternative for agencies
 *
 * Landing page for "honeybook alternative" search intent, aimed
 * specifically at agencies rather than HoneyBook's broader independent-
 * business audience. Same shape as the Dubsado page.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/honeybook/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, PanelsTopLeft, Users } from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "HoneyBook alternative for agencies";
const DESCRIPTION =
  "Comparing HoneyBook? Binx is built for agencies running many projects at once, with Kanban boards, a shared canvas and client approvals.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives/honeybook" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/alternatives/honeybook"),
};

const GAPS = [
  {
    icon: Users,
    title: "Built for agency projects",
    text: "HoneyBook is a popular clientflow tool for independent businesses and small teams. Binx is shaped around an agency running several projects at once, each with its own board, canvas and team.",
  },
  {
    icon: LayoutGrid,
    title: "Kanban and canvas, side by side",
    text: "Plan work on a Kanban board with assignees and due dates, or on a visual canvas. To-do rows on the canvas are the same tasks, so the two always agree.",
  },
  {
    icon: PanelsTopLeft,
    title: "Client approvals on the work",
    text: "Clients review the actual work in their portal, approve a card or a whole column, and each decision stays pinned to the version they saw.",
  },
];

const FAQ = [
  {
    q: "Is Binx just for solo freelancers too?",
    a: "No — Binx works for a solo operator, but it's built around a team: roles, assignees, and a shared client record everyone on the project can see.",
  },
  {
    q: "Does Binx handle proposals and contracts?",
    a: "Yes. Build a proposal from your services catalog, attach the contract or statement of work, and the client signs online with a binding e-signature that you can countersign. Every party gets a signed PDF, and signing can set the lead up as a client, invoice the deposit and start the project.",
  },
  {
    q: "What does the Free plan actually include?",
    a: "A full workspace — client portal, invoicing, and up to 3 clients and 3 active projects — with no card and no time limit, so you can run one real engagement through it before switching everyone over.",
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

const HoneyBookAlternativePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            faqJsonLd,
            breadcrumbJsonLd(TITLE, "/alternatives/honeybook"),
          ]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>HoneyBook alternative</span>
            <h1 className={styles.h1}>
              A HoneyBook alternative built for agency project work.
            </h1>
            <p className={styles.lead}>
              HoneyBook is a popular way for independent businesses to book and
              bill clients. {SITE.name} is built for an agency running several
              projects and people at once, with a client portal that follows
              the work from concept to sign-off.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/features" className={styles.btnGhost}>
                See everything it does
              </Link>
            </div>
            <p className={styles.heroNote}>
              Free plan available · no card required.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>How Binx differs</span>
            <h2 className={styles.h2}>
              Great at booking a client. Binx goes deep on the project.
            </h2>
          </div>
          <div className={styles.grid}>
            {GAPS.map(({ icon: Icon, title, text }) => (
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
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              What you get instead
            </span>
            <h2 className={styles.h2}>
              The booking is the start, not the whole thing.
            </h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The client side</h3>
              <ul className={styles.splitList}>
                <li>A branded portal that shows live project progress</li>
                <li>Invoices they can pay directly from the portal</li>
                <li>A shared canvas where the client approves work in place</li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The team side</h3>
              <ul className={styles.splitList}>
                <li>Task boards with assignees and due dates per project</li>
                <li>Everyone on the team sees the same client record</li>
                <li>
                  AI lead prospecting, proposals and invoicing under one login
                </li>
              </ul>
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
          <Link href="/pricing" className={styles.faqFooterLink}>
            See the Free, Starter, Pro and Scale plans in full →
          </Link>
        </div>
      </section>

      <MarketingCta
        heading="Bring your first client over and see."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default HoneyBookAlternativePage;
