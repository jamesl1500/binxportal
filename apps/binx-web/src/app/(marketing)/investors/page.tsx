/**
 * page.tsx - Investors
 *
 * The one-page overview for investors and accelerators: what Binx is, the
 * problem, what's live, how it makes money, why it wins, and how to get
 * the deck. Linked from the footer, not the header. The founder-supplied
 * facts (round size, traction, team, use of funds) live in lib/investors.ts,
 * and a section is left out entirely while its list is empty.
 *
 * @module apps/binx-web/src/app/(marketing)/investors/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Handshake,
  Layers,
  Mail,
  Rocket,
  Sparkles,
  Unplug,
  Users,
  Wrench,
} from "lucide-react";

import {
  INVESTOR_MAILTO,
  INVESTORS_PATH,
  ROUND,
  TEAM,
  TRACTION,
  USE_OF_FUNDS,
} from "@/lib/investors";
import { PLATFORM_FEE_LABEL } from "@/lib/payment-fees";
import {
  breadcrumbJsonLd,
  marketingOpenGraph,
  PLANS,
  SITE,
  TRIAL_DAYS,
} from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "Investors";
// Kept to 60 characters with the " · Binx Portal" suffix.
const SEO_TITLE = `Investors: Binx is raising its ${ROUND.stage.toLowerCase()} round`;
const DESCRIPTION =
  "Binx is one workspace for creative agencies, from first lead to paid invoice. It's live with paid plans, and we're raising our first round.";

export const metadata: Metadata = {
  title: SEO_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: INVESTORS_PATH },
  ...marketingOpenGraph(SEO_TITLE, DESCRIPTION, INVESTORS_PATH),
};

const lowestPaid = Math.min(...PLANS.filter((p) => p.price > 0).map((p) => p.price));
const highest = Math.max(...PLANS.map((p) => p.price));

const SNAPSHOT = [
  { label: "Stage", value: ROUND.stage },
  ...(ROUND.amount ? [{ label: "Raising", value: ROUND.amount }] : []),
  { label: "Product", value: "Live and self-serve" },
  { label: "Pricing", value: `Free, then $${lowestPaid}–$${highest}/mo` },
  { label: "Payments", value: `${PLATFORM_FEE_LABEL} of invoices paid online` },
];

const PROBLEMS = [
  {
    icon: Unplug,
    title: "Six tools and someone's week",
    text: "A small agency runs on a CRM, a proposal tool, a task board, a shared drive, an invoicing app and an inbox. Every handoff between them is re-typing.",
  },
  {
    icon: Users,
    title: "Clients stuck in email",
    text: "Files, feedback and sign-off happen in long threads. Nobody can say which version the client approved, or what's still waiting on them.",
  },
  {
    icon: Wrench,
    title: "No ops team to hold it together",
    text: "Large agencies hire operations people. Small ones don't, so the owner becomes the glue and spends billable hours on admin.",
  },
];

const LIVE = [
  "AI lead prospecting with saved searches",
  "Proposals clients sign online",
  "A branded client portal",
  "Projects, Kanban and a live visual canvas",
  "Client approvals pinned to the version they saw",
  "Invoices clients pay from the portal",
  "Messaging, time tracking and a team timeline",
  "Bulk import and export of every record",
];

/** Relative bar heights for the pricing ladder; the free tier gets a sliver. */
const ladderHeight = (price: number) => Math.max(8, Math.round((price / highest) * 100));

const ADVANTAGES = [
  {
    icon: Layers,
    title: "One record, lead to paid",
    text: "A lead becomes the proposal, the client, the project and the invoice without anyone re-typing it. Point tools can't do that without integrations an agency has to maintain.",
  },
  {
    icon: Handshake,
    title: "Clients work inside the product",
    text: "Clients sign, review, approve and pay in the portal. Every agency that joins brings its clients into Binx, which makes it hard to switch away from.",
  },
  {
    icon: Sparkles,
    title: "AI with a budget",
    text: "AI finds prospects, writes the morning briefing and drafts replies. Each plan includes a fixed AI allowance, so heavy use can't eat into the margin.",
  },
  {
    icon: Building2,
    title: "Built for the team stage",
    text: "Dubsado and HoneyBook fit a solo practice best. Binx is built for agencies with a team, with roles, shared boards and a feed for the whole team.",
  },
];

const WHO = [
  {
    icon: Users,
    title: "Angels who know the work",
    text: "You've run, grown or sold an agency or studio, or built software for small businesses. You'd shorten our learning curve as much as you'd fund it.",
  },
  {
    icon: Building2,
    title: "Funds backing vertical SaaS",
    text: "You invest early in software for a specific industry, and you know what small-business SaaS looks like at the seed stage.",
  },
  {
    icon: Rocket,
    title: "Accelerators",
    text: "Your program takes live B2B products with self-serve pricing. We'd like to hear about your next cohort or apply.",
  },
];

const InvestorsPage = () => {
  const showRaise = Boolean(ROUND.amount) || USE_OF_FUNDS.length > 0;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd(TITLE, INVESTORS_PATH)),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>
              Investors · {ROUND.stage}
            </span>
            <h1 className={styles.h1}>
              Help us give every small agency one place to run from.
            </h1>
            <p className={styles.lead}>
              {SITE.name} is live. It takes a creative agency from first lead
              to paid invoice in one workspace, and the agency&apos;s clients
              work inside it too. We&apos;re raising our first round, and
              we&apos;d like to hear from investors and accelerators who want
              to help build it.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <a href={INVESTOR_MAILTO} className={styles.btnPrimary}>
                <Mail aria-hidden="true" /> Request the deck
              </a>
              <Link href="/auth/signup" className={styles.btnGhost}>
                Try the product free
              </Link>
            </div>
            <p className={styles.heroNote}>
              The fastest way to judge us is to use it. The free plan takes a
              few minutes and needs no card.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight} aria-label="Snapshot">
        <div className={styles.container}>
          <dl className={styles.snapshot}>
            {SNAPSHOT.map((item) => (
              <div key={item.label} className={styles.snapshotItem}>
                <dt className={styles.snapshotLabel}>{item.label}</dt>
                <dd className={styles.snapshotValue}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {TRACTION.length > 0 && (
        <section className={styles.sectionTight}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>Traction</span>
              <h2 className={styles.h2}>Where we are today.</h2>
            </div>
            <div className={styles.statRow}>
              {TRACTION.map((stat) => (
                <div key={stat.label}>
                  <p className={styles.statNum}>{stat.value}</p>
                  <p className={styles.statLabel}>{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>The problem</span>
            <h2 className={styles.h2}>
              Small agencies run their business on glue.
            </h2>
            <p className={styles.lead}>
              The tools agencies use were each built for one job. The work in
              between them falls to whoever has the time.
            </p>
          </div>
          <div className={styles.grid}>
            {PROBLEMS.map(({ icon: Icon, title, text }) => (
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

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>What&apos;s live today</span>
              <h2 className={styles.h3}>
                The whole agency, already in production.
              </h2>
              <p className={styles.cardText}>
                This isn&apos;t a prototype. Agencies can sign up, invite their
                team and clients, and run real work today on the free plan or a
                paid one.
              </p>
              <ul className={styles.splitList}>
                {LIVE.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                <li>
                  <Link href="/features">See the full feature tour →</Link>
                </li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/dashboard.webp"
                alt="The Binx staff dashboard: a welcome greeting, an AI briefing, key numbers and recent activity."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              Business model
            </span>
            <h2 className={styles.h2}>Revenue that grows with the agency.</h2>
            <p className={`${styles.lead} ${styles.leadOnDark}`}>
              The free plan brings agencies in. They upgrade as they add
              clients, projects and team members, and every invoice their
              clients pay online earns a fee.
            </p>
          </div>

          <ol className={styles.ladder} aria-label="Plans, from free to the largest">
            {PLANS.map((plan) => (
              <li key={plan.name} className={styles.rung}>
                <span
                  className={styles.rungBar}
                  style={{ "--h": ladderHeight(plan.price) } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span className={styles.rungName}>{plan.name}</span>
                <span className={styles.rungPrice}>
                  ${plan.price}/mo
                </span>
                <span className={styles.rungNote}>{plan.features[1]}</span>
              </li>
            ))}
          </ol>

          <div className={styles.modelNotes}>
            <div>
              <h3 className={styles.stepTitle}>Subscriptions first</h3>
              <p className={styles.stepText}>
                Self-serve monthly plans, each with a {TRIAL_DAYS}-day,
                card-free trial. Plan limits on clients, projects, leads and
                seats push agencies up a tier as they grow.
              </p>
            </div>
            <div>
              <h3 className={styles.stepTitle}>Plus a share of payments</h3>
              <p className={styles.stepText}>
                Clients pay their invoices in the portal through Stripe
                Connect, and {SITE.name} keeps {PLATFORM_FEE_LABEL} of every
                invoice paid that way. Revenue grows with the money agencies
                bill, not just with seats.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Why we win</span>
            <h2 className={styles.h2}>
              What point tools can&apos;t copy quickly.
            </h2>
          </div>
          <div className={styles.gridTwo}>
            {ADVANTAGES.map(({ icon: Icon, title, text }) => (
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

      {TEAM.length > 0 && (
        <section className={`${styles.section} ${styles.sectionMuted}`}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>Team</span>
              <h2 className={styles.h2}>The people building it.</h2>
            </div>
            <div className={styles.gridTwo}>
              {TEAM.map((person) => (
                <article key={person.name} className={styles.card}>
                  <h3 className={styles.cardTitle}>{person.name}</h3>
                  <p className={styles.teamRole}>{person.role}</p>
                  <p className={styles.cardText}>{person.bio}</p>
                  {person.href && (
                    <a
                      href={person.href}
                      className={styles.cardLinkArrow}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Profile <ArrowRight aria-hidden="true" />
                      <span className={styles.srOnly}> (opens in a new tab)</span>
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {showRaise && (
        <section className={styles.section}>
          <div className={styles.narrow}>
            <div className={styles.sectionHead}>
              <span className={styles.eyebrow}>The round</span>
              <h2 className={styles.h2}>
                {ROUND.amount ? `Raising ${ROUND.amount}.` : "What the round is for."}
              </h2>
            </div>
            {USE_OF_FUNDS.length > 0 && (
              <ul className={styles.funds}>
                {USE_OF_FUNDS.map((use) => (
                  <li key={use.label} className={styles.fundsItem}>
                    <div className={styles.fundsHead}>
                      <span className={styles.cardTitle}>{use.label}</span>
                      <span className={styles.fundsShare}>{use.share}%</span>
                    </div>
                    <span
                      className={styles.fundsBar}
                      style={{ "--w": `${use.share}%` } as React.CSSProperties}
                      aria-hidden="true"
                    />
                    <p className={styles.cardText}>{use.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Who we&apos;d like to meet</span>
            <h2 className={styles.h2}>Partners who&apos;ll do more than fund it.</h2>
          </div>
          <div className={styles.gridTwo}>
            {WHO.map(({ icon: Icon, title, text }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardText}>{text}</p>
              </article>
            ))}
            <a href={INVESTOR_MAILTO} className={`${styles.card} ${styles.cardLink}`}>
              <span className={styles.cardIcon}>
                <Mail aria-hidden="true" />
              </span>
              <h3 className={styles.cardTitle}>Something else in mind?</h3>
              <p className={styles.cardText}>
                Strategic partners, design-partner agencies and advisors are
                welcome too. Tell us what you&apos;re thinking.
              </p>
              <span className={styles.cardLinkArrow}>
                Email us <ArrowRight aria-hidden="true" />
              </span>
            </a>
          </div>
        </div>
      </section>

      <MarketingCta
        heading="Want the deck and the numbers?"
        sub="Email us and we'll send the deck and current metrics, and set up a walkthrough of the product."
        primary={{ href: INVESTOR_MAILTO, label: "Request the deck" }}
        secondary={{ href: "/auth/signup", label: "Try it yourself" }}
      />
    </>
  );
};

export default InvestorsPage;
