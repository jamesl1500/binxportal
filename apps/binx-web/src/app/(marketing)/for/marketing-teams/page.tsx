/**
 * page.tsx - Binx for marketing teams
 *
 * Use-case landing page for the "marketing teams" segment. Leans on leads
 * and pipeline, AI assist for drafting, and running several client
 * campaigns from one place.
 *
 * @module apps/binx-web/src/app/(marketing)/for/marketing-teams/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, LayoutGrid, Sparkles, Users } from "lucide-react";

import { SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

export const metadata: Metadata = {
  title: "Binx for marketing teams",
  description:
    "A workspace for marketing teams and agencies: a lead pipeline, campaign-sized project boards per client, AI assist for drafts and reports, and a portal that keeps clients in the loop.",
  alternates: { canonical: "/for/marketing-teams" },
};

const CAPABILITIES = [
  {
    icon: CalendarCheck,
    title: "A pipeline that isn't a spreadsheet",
    text: "Track prospects by stage, score and owner, and convert a won lead straight into a client — no re-typing a name into a new tool.",
  },
  {
    icon: LayoutGrid,
    title: "One board per client, per campaign",
    text: "Run each retainer or campaign as its own project, with tasks, due dates and an owner — instead of one long list nobody trusts.",
  },
  {
    icon: Sparkles,
    title: "AI for the writing you do daily",
    text: "Draft a client-ready project update or a lead's first-touch summary in a click, with a monthly budget your team controls.",
  },
  {
    icon: Users,
    title: "Clients see progress without a call",
    text: "A portal per client shows where campaigns stand and what's been delivered — fewer status calls, more time on the work.",
  },
];

const MarketingTeamsPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>For marketing teams</span>
            <h1 className={styles.h1}>Run every client&apos;s campaigns from one pipeline.</h1>
            <p className={styles.lead}>
              {SITE.name} gives a marketing team a real lead pipeline, a project board per client or campaign, and
              a portal that answers the &quot;where are we&quot; question before the client has to ask.
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
            <h2 className={styles.h2}>From the first lead to the monthly report.</h2>
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
              <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>Multiple clients, one view</span>
              <h2 className={styles.h3}>Every retainer, one place to check on.</h2>
              <p className={styles.leadOnDark}>
                Switch between agencies — sorry, clients — without switching tools. Leads, active campaigns and
                overdue invoices all show up on one dashboard, so nothing slips because it was in a different tab.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingCta heading="Put your next campaign on a board." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default MarketingTeamsPage;
