/**
 * page.tsx - Binx for freelance collectives
 *
 * Use-case landing page for the "freelance collectives" segment — several
 * independents sharing clients and splitting work, not one person's solo
 * practice. Leans on the free tier and shared ownership of clients.
 *
 * @module apps/binx-web/src/app/(marketing)/for/freelance-collectives/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, LayoutGrid, Receipt, Users } from "lucide-react";

import { SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

export const metadata: Metadata = {
  title: "Binx for freelance collectives",
  description:
    "A shared workspace for freelance collectives: clients and projects owned by the group, not one person's inbox, with a free plan that fits before the work is billing enough to justify a cost.",
  alternates: { canonical: "/for/freelance-collectives" },
};

const CAPABILITIES = [
  {
    icon: Users,
    title: "Clients belong to the collective",
    text: "Every client and project is shared, not tied to whoever booked it — so anyone in the group can pick up a thread without a forwarded email chain.",
  },
  {
    icon: LayoutGrid,
    title: "See who's doing what, at a glance",
    text: "Task boards with assignees mean the group always knows who owns which piece of a project, even when nobody's in the same room.",
  },
  {
    icon: Receipt,
    title: "One invoice per client, however split",
    text: "Bill the client once, with your numbering and terms — how the group settles up internally is a separate conversation, not a separate invoice each.",
  },
  {
    icon: CalendarCheck,
    title: "A shared pipeline for new work",
    text: "Leads that come in go to the group's pipeline, not one inbox — so a new opportunity doesn't depend on whoever happened to check email first.",
  },
];

const FreelanceCollectivesPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>For freelance collectives</span>
            <h1 className={styles.h1}>Shared clients, not one person&apos;s inbox.</h1>
            <p className={styles.lead}>
              {SITE.name} gives a freelance collective one workspace the whole group owns — clients, projects and
              invoicing shared across everyone, starting on a plan that costs nothing while you find your footing.
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
            <h2 className={styles.h2}>For a group, not a single practice.</h2>
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
              <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>Start free</span>
              <h2 className={styles.h3}>No card, no seat fees while you&apos;re finding your rhythm.</h2>
              <p className={styles.leadOnDark}>
                The Free plan covers up to 3 team members, 3 clients and 3 active projects with no time limit —
                room enough for a small collective to run real client work before deciding whether to upgrade.
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingCta heading="Set up your collective's workspace." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default FreelanceCollectivesPage;
