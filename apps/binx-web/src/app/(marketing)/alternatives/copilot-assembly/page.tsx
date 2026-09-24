/**
 * page.tsx - Copilot / Assembly alternative
 *
 * Landing page for people comparing client-portal tools like Copilot and
 * Assembly — strong on the client-facing portal itself, generally lighter
 * on internal team project management, which is where this page positions
 * Binx.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/copilot-assembly/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Receipt, Users } from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "Copilot & Assembly alternative";
const DESCRIPTION =
  "Comparing Copilot or Assembly? Binx gives you the same client portal, plus the leads, proposals, project boards and invoicing that run behind it.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives/copilot-assembly" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/alternatives/copilot-assembly"),
};

const GAPS = [
  {
    icon: LayoutGrid,
    title: "The portal, without the project behind it",
    text: "Portal-first tools give clients a clean space to see files and updates — but the team still needs somewhere else to actually plan and run the project day to day.",
  },
  {
    icon: Users,
    title: "A second system for everything else",
    text: "Leads, the client record, and invoicing usually live in whatever tool you had before. That's one more login and one more place for details to drift out of sync.",
  },
  {
    icon: Receipt,
    title: "Billing bolted on, not built in",
    text: "Payments through a portal are one thing; a real invoice with your numbering, line items, and terms — tied to the same client record as the project — is another.",
  },
];

const FAQ = [
  {
    q: "Does Binx's client portal do what a portal-only tool does?",
    a: "Yes — a branded space per client with live project progress, shared files, invoices they can pay, and threaded messages. It's just backed by the same project boards, leads, and invoicing your team already uses.",
  },
  {
    q: "Can I use just the portal and not the project management side?",
    a: "You can, but most agencies end up using both once they see the client record, project, and invoice all stay in sync automatically — that's the part a standalone portal tool can't do.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd(TITLE, "/alternatives/copilot-assembly")]) }} />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Copilot & Assembly alternative</span>
            <h1 className={styles.h1}>The client portal, plus everything that runs behind it.</h1>
            <p className={styles.lead}>
              Tools like Copilot and Assembly are built around the client-facing portal. {SITE.name} gives you that
              same portal — live progress, files, invoices — connected directly to the leads, project boards, and
              invoicing your team actually runs the work with.
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
            <span className={styles.eyebrow}>Where it gets tight</span>
            <h2 className={styles.h2}>A great portal is only half the workspace.</h2>
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
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>One workspace, not two</span>
            <h2 className={styles.h2}>The portal and the project share a client record.</h2>
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
                <li>AI-found leads and signed proposals that become a client record</li>
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

      <MarketingCta heading="Open your first client portal today." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default CopilotAssemblyAlternativePage;
