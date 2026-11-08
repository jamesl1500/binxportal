/**
 * page.tsx - Marketing home
 *
 * The landing page: hero, the lead-to-paid flow, what's new, the core
 * capabilities, a closer look at the pieces that matter most, and the
 * closing CTA.
 *
 * @module apps/binx-web/src/app/(marketing)/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCheck,
  FileSignature,
  LayoutDashboard,
  LayoutGrid,
  PanelsTopLeft,
  Radar,
  Receipt,
  Users,
} from "lucide-react";

import {
  SITE,
  USE_CASE_PAGES,
  marketingOpenGraph,
  softwareApplicationJsonLd,
} from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "./marketing.module.scss";

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
  ...marketingOpenGraph(SITE.title, SITE.description, "/"),
};

const FLOW = [
  {
    index: "01",
    title: "Find the lead",
    text: "Tell the AI prospector who you want to work with. It finds real businesses that fit, and you save the search to run again.",
  },
  {
    index: "02",
    title: "Send the proposal",
    text: "Line items, tax and a valid-until date, pre-filled from the lead or client. They review and sign from a link.",
  },
  {
    index: "03",
    title: "Run the project",
    text: "Tasks, files and a visual canvas where clients review and approve the work, all inside a portal branded as yours.",
  },
  {
    index: "04",
    title: "Get paid",
    text: "Invoice from the project with the client's details already filled in. They pay straight from the portal.",
  },
];

const NEW_FEATURES = [
  {
    icon: Radar,
    title: "AI lead prospector",
    text: "Describe your ideal client and Binx finds matching businesses, backed by Google Places data when you connect it. Save searches and rerun them whenever the pipeline runs low.",
  },
  {
    icon: FileSignature,
    title: "Proposals with e-sign",
    text: "Build a priced proposal, send one link, and see when it's viewed. Clients sign or decline online, and it's filed on their client record and in their portal.",
  },
  {
    icon: PanelsTopLeft,
    title: "A visual canvas for every project",
    text: "Notes, images, links, files, columns and boards inside boards, dragged in from a card rail. To-do lists on the canvas are your real project tasks, so ticking one moves it to Done on the Kanban.",
    href: "/visual-canvas",
  },
  {
    icon: CheckCheck,
    title: "Client approvals, column by column",
    text: "Send one card or a whole column of options for review. Clients approve or request changes from their portal, guided by a review bar, and every sign-off is pinned to the version they saw.",
    href: "/client-approvals",
  },
  {
    icon: LayoutDashboard,
    title: "A dashboard you arrange",
    text: "Drag, reorder and hide widgets until the home screen shows what you care about, including your tasks and one-click quick actions.",
  },
];

const CAPABILITIES = [
  {
    icon: Radar,
    title: "Leads & AI prospecting",
    text: "Find prospects, track the pipeline, and turn a won lead into a client without re-typing a thing.",
  },
  {
    icon: FileSignature,
    title: "Proposals",
    text: "Priced, signable proposals that live on the client record and follow them into the portal.",
  },
  {
    icon: Users,
    title: "Clients & portal",
    text: "A tidy record for every client, plus a live portal where they see projects, files, proposals and invoices.",
  },
  {
    icon: LayoutGrid,
    title: "Projects & canvas",
    text: "Kanban boards, versioned files and a visual canvas where to-do lists are real tasks and clients approve work in place.",
  },
  {
    icon: Receipt,
    title: "Invoicing",
    text: "Draft, send and track invoices with your numbering and terms. Clients pay from the portal.",
  },
  {
    icon: LayoutDashboard,
    title: "Your dashboard",
    text: "A home screen you arrange yourself, with AI assist on hand to draft, summarise and score within a budget you set.",
  },
];

const FEATURE_LIST = [
  "AI lead prospecting with saved searches",
  "Proposals with online e-signature",
  "Client portal",
  "Visual project canvas with columns, nested boards, links and files",
  "To-do lists on the canvas synced with project tasks",
  "Client approvals on cards or whole columns, with version history",
  "Project boards and file versioning",
  "Invoicing with pay-from-portal",
  "Customizable drag-and-drop dashboard",
];

const HomePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationJsonLd(FEATURE_LIST)),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Agency operating system</span>
            <h1 className={styles.h1}>
              Run the whole agency from one calm place.
            </h1>
            <p className={styles.lead}>
              {SITE.name} takes you from the first lead to the final invoice.
              Find prospects with AI, send proposals clients sign online, run
              projects they approve in a live portal, and get paid, all in one
              workspace.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/features" className={styles.btnGhost}>
                See everything it does
              </Link>
            </div>
            <p className={styles.heroNote}>
              Free plan available · no card required · your data stays yours.
            </p>
          </div>
        </div>
      </section>

      <div className={styles.trust}>
        <p className={styles.trustLabel}>
          Built for the way small agencies actually work
        </p>
        <div className={styles.trustRow}>
          {USE_CASE_PAGES.map((page) => (
            <Link key={page.href} href={page.href} className={styles.trustLink}>
              {page.label}
            </Link>
          ))}
        </div>
      </div>

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>
              Lead to paid
            </span>
            <h2 className={styles.h2}>
              One thread from first hello to final invoice.
            </h2>
            <p className={`${styles.lead} ${styles.leadOnDark}`}>
              Every step picks up where the last one left off, so a lead&apos;s
              details become the proposal, the client, the project and the
              invoice without anyone re-typing them.
            </p>
          </div>
          <ol className={`${styles.steps} ${styles.stepsFour}`}>
            {FLOW.map((step) => (
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
            <span className={styles.eyebrow}>New in {SITE.name}</span>
            <h2 className={styles.h2}>
              Win more work, and close the loop with clients.
            </h2>
            <p className={styles.lead}>
              The latest additions cover the parts of agency life that used to
              happen in other tools: finding clients, pitching them, and getting
              a clear yes on the work.
            </p>
          </div>

          <div className={styles.grid}>
            {NEW_FEATURES.map(({ icon: Icon, title, text, href }) => (
              <article key={title} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <h3 className={styles.cardTitle}>
                  {title} <span className={styles.newTag}>New</span>
                </h3>
                <p className={styles.cardText}>{text}</p>
                {href && (
                  <Link href={href} className={styles.cardLinkArrow}>
                    Learn more <ArrowRight aria-hidden="true" />
                  </Link>
                )}
              </article>
            ))}
            <Link
              href="/features"
              className={`${styles.card} ${styles.cardLink}`}
            >
              <h3 className={styles.cardTitle}>See the full feature tour</h3>
              <p className={styles.cardText}>
                Everything Binx does, grouped by the part of the agency it
                serves.
              </p>
              <span className={styles.cardLinkArrow}>
                Explore features <ArrowRight aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>One workspace</span>
            <h2 className={styles.h2}>
              Everything the agency runs on, together.
            </h2>
            <p className={styles.lead}>
              No more stitching a CRM to a proposal tool to a task board to a
              folder of spreadsheets. It&apos;s all here, and it all talks to
              itself.
            </p>
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

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Client portal</span>
              <h2 className={styles.h3}>
                Give clients a window, not your inbox.
              </h2>
              <p className={styles.cardText}>
                Every client gets a branded portal with exactly what they should
                see: project progress, shared files, proposals to sign and
                invoices to pay. Nothing they shouldn&apos;t.
              </p>
              <ul className={styles.splitList}>
                <li>Live project status and shared files</li>
                <li>Proposals they can review and sign</li>
                <li>Invoices with pay-from-portal</li>
                <li>Threaded messages that keep context</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/portal.webp"
                alt="A client's portal view of a project: progress bar, task counts and timeline."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>

          <div className={`${styles.split} ${styles.splitAlt}`}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Visual canvas</span>
              <h2 className={styles.h3}>Plan the project the way you think.</h2>
              <p className={styles.cardText}>
                Every project gets a visual canvas the team and client build
                together, live. Drag notes, to-do lists, links, columns, boards
                and files in from the card rail, and connect them with lines.
                To-do rows are your real tasks, so the canvas and the Kanban
                never disagree.
              </p>
              <ul className={styles.splitList}>
                <li>Columns, boards inside boards, links, files and lines</li>
                <li>To-do lists synced with the project&apos;s tasks</li>
                <li>
                  <Link href="/visual-canvas">Tour the canvas →</Link>
                </li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/canvas.webp"
                alt="A project canvas with a column of logo directions out for review, a launch checklist of project tasks, a moodboard card, notes, a link and a PDF."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>

          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Client approvals</span>
              <h2 className={styles.h3}>Client sign-off, made seamless.</h2>
              <p className={styles.cardText}>
                Send a card, or a whole column of options, for review. A guided
                review bar walks the client through everything waiting on them
                in their portal. They approve or request changes with a note,
                and each decision is pinned to the exact version they saw.
              </p>
              <ul className={styles.splitList}>
                <li>Review one card or a whole column at once</li>
                <li>Version history behind every approval</li>
                <li>
                  <Link href="/client-approvals">How approvals work →</Link>
                </li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/approvals.webp"
                alt="A client reviewing a column of logo directions in their portal, with Approve all and Request changes."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>

          <div className={`${styles.split} ${styles.splitAlt}`}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Dashboard</span>
              <h2 className={styles.h3}>
                Start the day on a screen you designed.
              </h2>
              <p className={styles.cardText}>
                Drag widgets into the order you want, hide the ones you
                don&apos;t, and keep your own tasks and quick actions a click
                away. Each teammate&apos;s layout is their own.
              </p>
              <ul className={styles.splitList}>
                <li>Drag-and-drop, hideable widgets</li>
                <li>My tasks and quick actions at a glance</li>
                <li>Saved per person, not per agency</li>
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

          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Invoicing</span>
              <h2 className={styles.h3}>Bill without leaving the workspace.</h2>
              <p className={styles.cardText}>
                Your numbering, your terms, your currency. Pick the client and
                their details fill themselves in, then send and watch payments
                land, with reminders you can draft in a click.
              </p>
              <ul className={styles.splitList}>
                <li>Recipient details auto-filled from the client</li>
                <li>Partial payments and overdue tracking</li>
                <li>Clients pay straight from the portal</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/invoicing.webp"
                alt="Creating an invoice in Binx: the client and project picked, line items with live totals, notes and payment instructions."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <MarketingCta />
    </>
  );
};

export default HomePage;
