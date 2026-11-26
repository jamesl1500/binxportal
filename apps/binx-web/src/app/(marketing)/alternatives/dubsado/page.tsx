/**
 * page.tsx - Dubsado alternative
 *
 * Landing page for "dubsado alternative" search intent — people evaluating
 * options while already comparing tools, card in hand. Dubsado is a strong
 * CRM/contracts/invoicing tool built for solo service providers; this page
 * speaks to the point where an agency outgrows that shape and needs actual
 * team project management alongside the client-facing side.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/dubsado/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, PanelsTopLeft, Users } from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "Dubsado alternative for agencies";
const DESCRIPTION =
  "A Dubsado alternative for a growing agency: signable proposals, real project boards, a live client portal and a whole team in one workspace.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alternatives/dubsado" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/alternatives/dubsado"),
};

const GAPS = [
  {
    icon: LayoutGrid,
    title: "The project at the center",
    text: "Dubsado is known for forms, contracts and client workflows, and it has task boards too. Binx centers the day-to-day on Kanban boards and a visual canvas, where to-do rows are the project's real tasks.",
  },
  {
    icon: Users,
    title: "One view for the whole team",
    text: "Owners, admins and members share one client record, with assignees, a My work view and a team timeline on the dashboard.",
  },
  {
    icon: PanelsTopLeft,
    title: "Clients work with you on the canvas",
    text: "In the Binx portal, clients follow project progress, add to a shared canvas, and approve work card by card, with every sign-off pinned to a version.",
  },
];

const FAQ = [
  {
    q: "Can I move my clients and invoices over from Dubsado?",
    a: "Clients, yes: import them from a spreadsheet and start invoicing in Binx right away. There's no direct Dubsado connection, and past invoices don't import, so keep those records where they are.",
  },
  {
    q: "Does Binx do contracts and forms like Dubsado?",
    a: "Partly. Binx proposals carry a binding e-signature, an optional countersignature and a signed PDF, and you can attach your own contract to one for the client to sign. A signature can then set up the client, deposit invoice, project and kickoff questionnaire automatically. There are no contract templates or general form builder yet, so you may want to keep a separate tool for those.",
  },
  {
    q: "Is there a free plan to try it?",
    a: "Yes — the Free plan has no card required and no time limit, capped on clients, projects, and leads so you can run a real client through it before deciding.",
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

const DubsadoAlternativePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            faqJsonLd,
            breadcrumbJsonLd(TITLE, "/alternatives/dubsado"),
          ]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Dubsado alternative</span>
            <h1 className={styles.h1}>
              A Dubsado alternative built around the project.
            </h1>
            <p className={styles.lead}>
              Dubsado is a well-established tool for forms, contracts and client
              workflows. {SITE.name} puts the project at the center: a team
              running several client projects at once, with a shared canvas and
              a client portal that shows real progress.
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
              Strong at booking the work. Binx focuses on running it.
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
              One workspace for the client and the team.
            </h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The client side</h3>
              <ul className={styles.splitList}>
                <li>
                  A branded portal showing live project progress
                </li>
                <li>Invoices they can pay directly from the portal</li>
                <li>
                  Threaded messages tied to the project, not a shared inbox
                </li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The team side</h3>
              <ul className={styles.splitList}>
                <li>Task boards with assignees and due dates per project</li>
                <li>A shared canvas the team and client arrange together</li>
                <li>
                  AI lead prospecting, proposals and invoicing on one client
                  record
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

export default DubsadoAlternativePage;
