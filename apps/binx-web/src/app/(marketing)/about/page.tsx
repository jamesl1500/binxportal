/**
 * page.tsx - About
 *
 * The short version of why Binx exists and what it's trying to be.
 *
 * @module apps/binx-web/src/app/(marketing)/about/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "About";
const DESCRIPTION =
  "Binx is one workspace for the whole agency — leads, clients, projects, files, invoicing and a client portal — built for small teams who'd rather do the work than manage the tools.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/about"),
};

const PRINCIPLES = [
  {
    title: "One place, on purpose",
    text: "Context shouldn't live in five tabs. When leads, projects and invoices share a home, the whole team knows where things stand.",
  },
  {
    title: "Calm by default",
    text: "Software should get out of the way. Fewer settings, clearer screens, no notification noise you didn't ask for.",
  },
  {
    title: "Clients are part of the team",
    text: "The portal isn't an afterthought. Clients see progress, files and invoices in a space that looks like yours, not ours.",
  },
  {
    title: "Your data is yours",
    text: "Export it whenever you want. We don't sell it, and we don't train models on it.",
  },
];

const AboutPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>About</span>
            <h1 className={styles.h1}>Built for the agencies that don&apos;t have an ops team.</h1>
            <p className={styles.lead}>
              {SITE.name} started from a simple frustration: running a small agency means gluing together a CRM, a
              task tool, a folder of files, an invoicing app and a pile of email — and the glue is a person&apos;s
              week.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.narrow}>
          <div className={styles.prose}>
            <p>
              So we built the thing we wanted: one workspace where a lead becomes a client becomes a project becomes
              an invoice, without anyone re-typing a name. Where the client sees what they should and nothing they
              shouldn&apos;t. Where the team opens one tab in the morning and knows what the day looks like.
            </p>
            <p>
              {SITE.name} is young and moving fast. If something&apos;s missing or awkward, tell us — a lot of what&apos;s
              here started as a note from someone running an agency.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>What we care about</span>
          </div>
          <div className={styles.gridTwo}>
            {PRINCIPLES.map((principle) => (
              <article key={principle.title} className={styles.card}>
                <h2 className={styles.cardTitle}>{principle.title}</h2>
                <p className={styles.cardText}>{principle.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta />
    </>
  );
};

export default AboutPage;
