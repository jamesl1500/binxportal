/**
 * page.tsx - Copilot / Assembly alternative
 *
 * Landing page for people comparing client-portal tools like Copilot and
 * Assembly — strong on the client-facing portal itself, generally lighter
 * on internal team project management, which is where this page positions
 * Binx.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/copilot-assembly/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Receipt, Users } from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "Assembly (formerly Copilot) alternative";
const DESCRIPTION =
  "Comparing Assembly, formerly Copilot? Binx pairs a branded client portal with the leads, proposals, project boards and canvas that run behind it.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives/copilot-assembly" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/alternatives/copilot-assembly"),
};

const GAPS = [
  {
    icon: LayoutGrid,
    title: "The project behind the portal",
    text: "Assembly is built around a polished client portal. Binx adds the place your team plans the work: Kanban boards, a visual canvas and time tracking on every project.",
  },
  {
    icon: Users,
    title: "Leads before they're clients",
    text: "AI prospecting and a lead pipeline sit in the same workspace, so a won lead becomes a client, a project and an invoice without re-typing anything.",
  },
  {
    icon: Receipt,
    title: "Billing tied to the project",
    text: "Invoices carry your numbering, line items and terms, can be built from tracked time, and sit on the same client record as the project.",
  },
];

const FAQ = [
  {
    q: "Does Binx's client portal do what a portal-only tool does?",
    a: "It covers the core: a branded space per client with live project progress, shared files, invoices they can pay, and threaded messages. It's backed by the same project boards, leads and invoicing your team uses.",
  },
  {
    q: "Can I use just the portal and not the project management side?",
    a: "You can. The advantage of using both is that the client record, project and invoice stay in sync automatically.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — the Free plan includes the client portal and invoicing with no card and no time limit, capped on clients and projects so you can try it with one real client first.",
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

const CopilotAssemblyAlternativePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            faqJsonLd,
            breadcrumbJsonLd(TITLE, "/alternatives/copilot-assembly"),
          ]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>
              Assembly (formerly Copilot) alternative
            </span>
            <h1 className={styles.h1}>
              The client portal, plus everything that runs behind it.
            </h1>
            <p className={styles.lead}>
              Assembly, formerly Copilot, is built around the client-facing
              portal. {SITE.name} gives you a branded portal too, with live
              progress, files and invoices, connected directly to the leads,
              project boards and canvas your team runs the work with.
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
              A portal, with the whole project behind it.
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
              One workspace, not two
            </span>
            <h2 className={styles.h2}>
              The portal and the project share a client record.
            </h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The client side</h3>
              <ul className={styles.splitList}>
                <li>A branded portal with live project progress and files</li>
                <li>Invoices they can pay directly from the portal</li>
                <li>Threaded messages tied to the project</li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The team side</h3>
              <ul className={styles.splitList}>
                <li>Task boards and a shared canvas behind every portal</li>
                <li>
                  AI-found leads and signed proposals that become a client
                  record
                </li>
                <li>Your invoice numbering, terms, and payment tracking</li>
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
        heading="Open your first client portal today."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default CopilotAssemblyAlternativePage;
