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
 * @author Binx.io
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
    title: "No real project workspace",
    text: "Dubsado is built around forms, contracts, and a pipeline — strong for booking the work, thinner once a project has tasks, assignees, and a team moving through them together.",
  },
  {
    icon: Users,
    title: "Built for one operator",
    text: "It shows in the workflows and permissions: great for a solo consultant, more work to stretch across a growing team with different roles per client.",
  },
  {
    icon: PanelsTopLeft,
    title: "Client view is a form, not a workspace",
    text: "Clients get portals for forms, invoices, and files — not a live view of where their project actually stands, or a shared canvas to collaborate on.",
  },
];

const FAQ = [
  {
    q: "Can I move my clients and invoices over from Dubsado?",
    a: "You can add clients directly and start invoicing in Binx right away. There's no automated Dubsado importer today — for most agencies switching, re-entering active clients is a short one-time task.",
  },
  {
    q: "Does Binx do contracts and forms like Dubsado?",
    a: "Partly. Binx has proposals with online e-signature, so a client can review your scope and pricing and sign from a link. It doesn't have Dubsado-style intake forms or contract templates yet, so some agencies keep a separate tool for those.",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd(TITLE, "/alternatives/dubsado")]) }} />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Dubsado alternative</span>
            <h1 className={styles.h1}>A Dubsado alternative built for a whole agency, not one operator.</h1>
            <p className={styles.lead}>
              Dubsado is a solid CRM and invoicing tool for a solo practice. {SITE.name} is built for the point past
              that — a team running several client projects at once, with a client portal that shows real progress,
              not just a form.
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
            <h2 className={styles.h2}>Great for booking the work. Thinner once you&apos;re running it.</h2>
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
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>What you get instead</span>
            <h2 className={styles.h2}>One workspace for the client and the team.</h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The client side</h3>
              <ul className={styles.splitList}>
                <li>A branded portal showing live project progress, not just paperwork</li>
                <li>Invoices they can pay directly from the portal</li>
                <li>Threaded messages tied to the project, not a shared inbox</li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>The team side</h3>
              <ul className={styles.splitList}>
                <li>Task boards with assignees and due dates per project</li>
                <li>A shared canvas the team and client arrange together</li>
                <li>AI lead prospecting, proposals and invoicing on one client record</li>
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

      <MarketingCta heading="Bring your first client over and see." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default DubsadoAlternativePage;
