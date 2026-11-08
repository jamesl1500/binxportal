/**
 * page.tsx - Client approvals
 *
 * Feature deep-dive for "client approval software" / "creative approval
 * workflow" / "design sign-off" search intent. Walks through how a card (or
 * a whole column of options) goes to the client, how they decide, and how
 * every decision stays pinned to the exact version they saw. Screenshots
 * come from e2e/capture-marketing.spec.ts.
 *
 * @module apps/binx-web/src/app/(marketing)/client-approvals/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BellRing,
  Columns3,
  History,
  LayoutGrid,
  ListChecks,
  MessageSquarePlus,
} from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const PATH = "/client-approvals";
const TITLE = "Client approval software for creative agencies";
const DESCRIPTION =
  "Send a card or a whole column of options to your client, let them approve or request changes in their portal, and keep every sign-off pinned to a version.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  keywords: [
    "client approval software",
    "creative approval workflow",
    "design approval tool",
    "client sign-off",
    "design feedback tool for agencies",
    "proofing software for agencies",
  ],
  ...marketingOpenGraph(TITLE, DESCRIPTION, PATH),
};

const STEPS = [
  {
    index: "01",
    title: "Lay out the options",
    text: "Put concepts, copy or files on the project canvas. Group the options into a column, so the client sees them side by side.",
  },
  {
    index: "02",
    title: "Send it for review",
    text: "Ask for approval on one card, or send the whole column in one click. Each request snapshots exactly what you sent.",
  },
  {
    index: "03",
    title: "The client decides",
    text: "A review bar in their portal walks them through every card waiting on them. They approve, or request changes with a note.",
  },
  {
    index: "04",
    title: "Sign-off, on record",
    text: "You're notified the moment they decide. The approval stays tied to that version, even if the card changes later.",
  },
];

const FEATURES = [
  {
    icon: Columns3,
    title: "Review a whole column at once",
    text: "Three logo directions, four headline options: send the column and the client can approve them all, or answer each one. The column header keeps score: “1 of 3 approved, 2 awaiting review”.",
  },
  {
    icon: History,
    title: "Every approval pinned to a version",
    text: "Each request takes a snapshot. If the card is edited afterwards the approval is cleared, and the version they signed off on stays in the history, so “which one did they approve?” always has an answer.",
  },
  {
    icon: ListChecks,
    title: "A guided review bar for clients",
    text: "Clients never hunt across a big board. The bar counts what's waiting on them and jumps straight to each card, including cards inside columns and on nested boards.",
  },
  {
    icon: MessageSquarePlus,
    title: "Feedback where the work is",
    text: "Comments and emoji reactions on any card, or a comment pin dropped anywhere on the board. No screenshot-and-email threads.",
  },
  {
    icon: BellRing,
    title: "Instant, tidy notifications",
    text: "The person who asked hears back as soon as the client decides, with one notification per decision, not one per card.",
  },
  {
    icon: LayoutGrid,
    title: "Live for everyone",
    text: "Approvals, comments and edits appear for the team and the client the moment they happen. Nobody works off a stale copy.",
  },
];

const FAQ = [
  {
    q: "What can a client approve?",
    a: "Notes, images, links and files on the project canvas, one at a time or as a whole column. Approvals happen in the client's own portal, so they don't need a separate review tool or a new login for each project.",
  },
  {
    q: "What happens if we change a card after the client approved it?",
    a: "The live card goes back to needing approval, but the approved version is kept. Anyone can open the card's history to see exactly what was signed off, when, and by whom.",
  },
  {
    q: "Can the client ask for changes instead of approving?",
    a: "Yes. They choose Request changes and add a note on what to change. The note shows on the card and goes to the teammate who asked, who can update the card and request approval again.",
  },
  {
    q: "Is client approval included on the Free plan?",
    a: "Yes. The canvas, the client portal and approvals are on every plan, including Free, which needs no card.",
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

const ClientApprovalsPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd("Client approvals", PATH)]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Client approvals</span>
            <h1 className={styles.h1}>
              Get a clear yes from clients, without the email chain.
            </h1>
            <p className={styles.lead}>
              Send a card, or a whole column of options, to your client for
              review. They approve or request changes from their portal, and
              every sign-off stays pinned to the exact version they saw.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/visual-canvas" className={styles.btnGhost}>
                Explore the canvas
              </Link>
            </div>
            <p className={styles.heroNote}>
              Included on every plan · no card required.
            </p>
          </div>
          <figure className={styles.heroShot}>
            <Image
              src="/marketing/approvals.webp"
              alt="A client reviewing a column of logo directions in their portal: one approved, two awaiting review, with Approve all and Request changes buttons."
              width={1600}
              height={1138}
              sizes="(min-width: 1100px) 68rem, 100vw"
              priority
            />
          </figure>
          <p className={styles.heroShotCaption}>
            The client&apos;s view: a review bar counts what&apos;s waiting, and
            a column can be approved in one go.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              How it works
            </span>
            <h2 className={styles.h2}>From first draft to signed off.</h2>
          </div>
          <ol className={`${styles.steps} ${styles.stepsFour}`}>
            {STEPS.map((step) => (
              <li key={step.index} className={styles.step}>
                <span className={styles.stepIndex}>{step.index}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>What&apos;s in it</span>
            <h2 className={styles.h2}>
              Approvals built for how agencies present work.
            </h2>
            <p className={styles.lead}>
              Agencies rarely show one option, so {SITE.name} lets you send a
              set of options and get a decision on all of them.
            </p>
          </div>
          <div className={styles.grid}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
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

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>The team side</span>
              <h2 className={styles.h3}>See where every decision stands.</h2>
              <p className={styles.cardText}>
                Your team sees the same board: what&apos;s approved, what&apos;s
                waiting, and what came back with changes. Approvals sit next to
                the tasks they unblock, on the same canvas as your to-do lists.
              </p>
              <ul className={styles.splitList}>
                <li>Status on every card, visible at a glance</li>
                <li>A roll-up on each column (“1 of 3 approved”)</li>
                <li>Withdraw or re-request in a click</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/canvas.webp"
                alt="The team's project canvas: a column of logo directions with approval badges, a launch checklist, a moodboard and a brief."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 className={styles.h2}>About client approvals.</h2>
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
            Related: <Link href="/visual-canvas">the visual project canvas</Link>
            {" · "}
            <Link href="/for/design-studios">Binx for design studios</Link>
            {" · "}
            <Link href="/for/branding-agencies">Binx for branding agencies</Link>
          </p>
        </div>
      </section>

      <MarketingCta
        heading="Send your next concept for sign-off."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default ClientApprovalsPage;
