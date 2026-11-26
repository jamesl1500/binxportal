/**
 * page.tsx - Client onboarding
 *
 * Feature deep-dive for "client onboarding software" / "automate client
 * onboarding" / "deal room for agencies" search intent: the lead portal (a
 * branded page for a prospect with their proposals and a question thread,
 * Starter plan and up) and what a signature sets off: the lead becomes a
 * client, gets their portal, the deposit is invoiced and the project and
 * kickoff start. Screenshots come from e2e/capture-marketing.spec.ts.
 *
 * @module apps/binx-web/src/app/(marketing)/client-onboarding/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ClipboardList,
  DoorOpen,
  FolderKanban,
  MessagesSquare,
  Receipt,
  UserCheck,
} from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE, TRIAL_DAYS } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const PATH = "/client-onboarding";
const TITLE = "Client onboarding software for agencies";
const DESCRIPTION =
  "Give each lead a branded portal with their proposal and a Q&A thread. Once they sign, Binx makes them a client, invoices the deposit and starts the project.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  keywords: [
    "client onboarding software",
    "automated client onboarding",
    "agency client onboarding",
    "deal room for agencies",
    "lead portal",
    "proposal to project automation",
    "deposit invoice on signing",
  ],
  ...marketingOpenGraph(TITLE, DESCRIPTION, PATH),
};

const STEPS = [
  {
    index: "01",
    title: "Open a lead portal",
    text: "Turn it on from the lead's page and add a welcome note. You get a private link to send, with no login for the lead.",
  },
  {
    index: "02",
    title: "Answer their questions",
    text: "Your proposal sits in the portal, with a thread for questions. Your team is notified, and the lead gets your reply by email.",
  },
  {
    index: "03",
    title: "They sign",
    text: "The lead reviews and signs from their portal, with a binding e-signature and, if you want it, your countersignature.",
  },
  {
    index: "04",
    title: "Onboarding runs itself",
    text: "They become a client with their own portal, the deposit invoice goes out, and the project starts once it's paid.",
  },
];

const FEATURES = [
  {
    icon: DoorOpen,
    title: "A branded portal for every lead",
    text: "Your logo, your welcome note and every proposal you've sent them, in one link. Turn it off at any time and the link stops working.",
  },
  {
    icon: MessagesSquare,
    title: "Questions before they sign",
    text: "Leads ask in the portal instead of a long email thread. Replies land in the portal and in their inbox, and the whole conversation stays on the lead.",
  },
  {
    icon: UserCheck,
    title: "Lead to client, automatically",
    text: "A signature converts the lead into a client and invites the signer to your client portal, with no data to re-type.",
  },
  {
    icon: Receipt,
    title: "The deposit, invoiced on signing",
    text: "Set a deposit as a percentage of the proposal and the invoice is issued as soon as it's signed. With Stripe connected, they can pay it online.",
  },
  {
    icon: FolderKanban,
    title: "The project starts when it's paid",
    text: "Choose to start a project on acceptance. It waits for the deposit if there is one, then appears for your team, named after the proposal.",
  },
  {
    icon: ClipboardList,
    title: "A kickoff, ready when they arrive",
    text: "Pick a kickoff questionnaire on the proposal, and it's sent the moment the new client joins their portal.",
  },
];

const FAQ = [
  {
    q: "What is a lead portal?",
    a: "A private, branded page for one prospect, with your welcome note, the proposals you've sent them and a thread for their questions. Leads open it from a link, without creating an account.",
  },
  {
    q: "What happens when a lead signs a proposal?",
    a: `${SITE.name} converts the lead into a client, invites the signer to your client portal, issues the deposit invoice if the proposal has one, and starts the project and kickoff if you asked for them. If any step can't run, the proposal shows what's blocked and you can retry it.`,
  },
  {
    q: "Does the project wait for the deposit?",
    a: "Yes. When a proposal has a deposit, the project starts once that invoice is paid in full. Without a deposit it starts as soon as the proposal is signed.",
  },
  {
    q: "Which plans include lead portals?",
    a: `Lead portals are on Starter and above, with a ${TRIAL_DAYS}-day trial and no card. Proposals, e-signatures and the automatic client setup are on every plan, including Free.`,
  },
  {
    q: "Can existing clients sign the same way?",
    a: "Yes. Clients sign proposals in their client portal, and the deposit invoice, project and kickoff follow just the same.",
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

const ClientOnboardingPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd("Client onboarding", PATH)]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Lead portals &amp; onboarding</span>
            <h1 className={styles.h1}>
              From &ldquo;interested&rdquo; to onboarded, in one signature.
            </h1>
            <p className={styles.lead}>
              Give every lead a branded portal with their proposal and a place
              to ask questions. When they sign, {SITE.name} makes them a client,
              invoices the deposit and starts the project. Nobody re-types a
              thing.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Start free trial
              </Link>
              <Link href="/proposal-software" className={styles.btnGhost}>
                How signing works
              </Link>
            </div>
            <p className={styles.heroNote}>
              Lead portals on Starter and up · automatic onboarding on every plan.
            </p>
          </div>
          <figure className={styles.heroShot}>
            <Image
              src="/marketing/lead-portal.webp"
              alt="A lead portal for a prospect: the agency's welcome note, a proposal ready to review and sign, and a question answered by the agency."
              width={1600}
              height={1138}
              sizes="(min-width: 1100px) 68rem, 100vw"
              // Near the top on desktop (often the largest paint), below the fold
              // on phones: fetched right away, but without a preload or high
              // priority that would compete with fonts/CSS on slow connections.
              loading="eager"
            />
          </figure>
          <p className={styles.heroShotCaption}>
            What the lead sees: your note, their proposal, and answers to their
            questions.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              How it works
            </span>
            <h2 className={styles.h2}>One link from first look to kickoff.</h2>
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
              The admin between &ldquo;yes&rdquo; and day one, done for you.
            </h2>
            <p className={styles.lead}>
              Winning the work used to start a round of setup: add the client,
              send an invoice, create the project, chase the brief. Now the
              signature does it.
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
              <span className={styles.eyebrow}>The client side</span>
              <h2 className={styles.h3}>They land somewhere that&apos;s ready.</h2>
              <p className={styles.cardText}>
                Once they&apos;ve signed, the lead portal points the new client
                to their client portal. The signed proposal, the deposit
                invoice and the kickoff are already waiting there, with their
                project, files and messages to follow.
              </p>
              <ul className={styles.splitList}>
                <li>A welcome email with their portal invitation</li>
                <li>The deposit invoice, payable online</li>
                <li>The signed proposal and its certificate on file</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/portal.webp"
                alt="The client portal home: the client's projects, invoices and messages in the agency's branding."
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
            <h2 className={styles.h2}>About lead portals and onboarding.</h2>
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
            Related: <Link href="/proposal-software">proposals and e-signatures</Link>
            {" · "}
            <Link href="/free-client-portal">the free client portal</Link>
            {" · "}
            <Link href="/alternatives/dubsado">Binx as a Dubsado alternative</Link>
          </p>
        </div>
      </section>

      <MarketingCta
        heading="Turn your next lead into a client in one step."
        sub={`${SITE.name} Starter includes lead portals, with a ${TRIAL_DAYS}-day free trial.`}
      />
    </>
  );
};

export default ClientOnboardingPage;
