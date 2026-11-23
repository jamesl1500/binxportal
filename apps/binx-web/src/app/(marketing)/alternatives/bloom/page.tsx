/**
 * page.tsx - Bloom.io alternative
 *
 * Landing page for "bloom alternative" search intent. Bloom is built mainly
 * for creative freelancers (photographers especially); this page positions
 * Binx for a multi-person agency running several client types at once.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/bloom/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, PanelsTopLeft, Users } from "lucide-react";

import {
  breadcrumbJsonLd,
  marketingOpenGraph,
  SITE,
  USE_CASE_PAGES,
} from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "Bloom.io alternative for agencies";
const DESCRIPTION =
  "Comparing Bloom? Binx is the alternative for creative agencies: several people, several clients, Kanban boards and a shared canvas in one workspace.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives/bloom" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/alternatives/bloom"),
};

const RELATED_USE_CASES = USE_CASE_PAGES.filter(
  (page) =>
    page.href === "/for/design-studios" ||
    page.href === "/for/freelance-collectives",
);

const GAPS = [
  {
    icon: Users,
    title: "Shaped for agencies",
    text: "Bloom is popular with photographers and creative service businesses. Binx is shaped around an agency team sharing clients, projects and a pipeline.",
  },
  {
    icon: LayoutGrid,
    title: "Task-level project work",
    text: "Assign tasks across the team on Kanban boards, see who owns what in My work, and check project status at a glance.",
  },
  {
    icon: PanelsTopLeft,
    title: "Any kind of engagement",
    text: "Retainers, multi-month projects and one-off work all fit the same structure, with recurring invoice schedules for regular billing.",
  },
];

const FAQ = [
  {
    q: "We're not photographers — does Binx still fit?",
    a: "Yes — Binx isn't built around any one discipline. It's a general project + client + invoicing workspace that works for design studios, marketing teams, branding agencies, and freelance collectives alike.",
  },
  {
    q: "Can more than one person manage the same client?",
    a: "Yes — team members, roles, and assignees are core to how Binx works, not an add-on. Every client and project is shared, not owned by one person's login.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — no card, no time limit, capped on clients and projects so your first client can run through it end to end before you decide.",
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

const BloomAlternativePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            faqJsonLd,
            breadcrumbJsonLd(TITLE, "/alternatives/bloom"),
          ]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Bloom.io alternative</span>
            <h1 className={styles.h1}>
              A Bloom alternative built for agency teams.
            </h1>
            <p className={styles.lead}>
              Bloom is a popular CRM for photographers and creative businesses.
              {SITE.name} is built for an agency team: several people sharing
              clients and projects, with a canvas, client approvals and
              invoicing in one place.
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
              Great for creative bookings. Binx is built for agency teams.
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
              Built for however many people are actually doing the work.
            </h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The client side</h3>
              <ul className={styles.splitList}>
                <li>A branded portal with live project progress and files</li>
                <li>Invoices they can pay directly from the portal</li>
                <li>A shared canvas where the client approves work in place</li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The team side</h3>
              <ul className={styles.splitList}>
                <li>Task boards with assignees and due dates per project</li>
                <li>Every client and project shared across the team</li>
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
          <p className={styles.faqRelated}>
            More Binx fits:{" "}
            {RELATED_USE_CASES.map((page, index) => (
              <span key={page.href}>
                <Link href={page.href}>{page.label}</Link>
                {index < RELATED_USE_CASES.length - 1 ? ", " : ""}
              </span>
            ))}
            {" · "}
            <Link href="/pricing">See the plans →</Link>
          </p>
        </div>
      </section>

      <MarketingCta
        heading="Bring your first client over and see."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default BloomAlternativePage;
