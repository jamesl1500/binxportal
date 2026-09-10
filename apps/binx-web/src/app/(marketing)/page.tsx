/**
 * page.tsx - Marketing home
 *
 * The landing page: hero, what Binx covers, how it works, a closer look at the
 * pieces that matter most, and the closing CTA.
 *
 * @module apps/binx-web/src/app/(marketing)/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarCheck, FolderOpen, LayoutGrid, Receipt, Sparkles, Users } from "lucide-react";

import { SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "./marketing.module.scss";

// Home keeps the full, un-suffixed title. openGraph (incl. the root
// opengraph-image.tsx) and the canonical are inherited from the root layout.
export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
};

const CAPABILITIES = [
  {
    icon: CalendarCheck,
    title: "Leads",
    text: "Capture prospects, track the pipeline, and turn a won lead into a client without re-typing a thing.",
  },
  {
    icon: Users,
    title: "Clients & portal",
    text: "A tidy record for every client — and a live portal where they see projects, files and invoices.",
  },
  {
    icon: LayoutGrid,
    title: "Projects",
    text: "Boards, tasks, a freeform canvas, and a team view that tells everyone what's next.",
  },
  {
    icon: FolderOpen,
    title: "Files",
    text: "Every asset in one place, versioned and shareable, attached to the project it belongs to.",
  },
  {
    icon: Receipt,
    title: "Invoicing",
    text: "Draft, send and track invoices with your numbering and terms. Clients pay from the portal.",
  },
  {
    icon: Sparkles,
    title: "AI assist",
    text: "Draft updates, summarise a project, score a lead — with a monthly budget you control.",
  },
];

const STEPS = [
  {
    index: "01",
    title: "Create your workspace",
    text: "Add your agency, invite the team, set your branding and invoicing details once.",
  },
  {
    index: "02",
    title: "Bring the work in",
    text: "Add clients and projects, upload files, and open a portal for each client in a click.",
  },
  {
    index: "03",
    title: "Run the day from one place",
    text: "Leads, tasks, messages and invoices share a home — so nothing falls through the gaps.",
  },
];

const HomePage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Agency operating system</span>
            <h1 className={styles.h1}>Run the whole agency from one calm place.</h1>
            <p className={styles.lead}>
              {SITE.name} pulls leads, clients, projects, files, invoicing and a live client portal into a single
              workspace — so your team spends its time on the work, not on chasing it between tools.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/features" className={styles.btnGhost}>
                See everything it does
              </Link>
            </div>
            <p className={styles.heroNote}>Free plan available · no card required · your data stays yours.</p>
          </div>
        </div>
      </section>

      <div className={styles.trust}>
        <p className={styles.trustLabel}>Built for the way small agencies actually work</p>
        <div className={styles.trustRow}>
          <span>Design studios</span>
          <span>Marketing teams</span>
          <span>Branding agencies</span>
          <span>Freelance collectives</span>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>One workspace</span>
            <h2 className={styles.h2}>Everything the agency runs on, together.</h2>
            <p className={styles.lead}>
              No more stitching a CRM to a task tool to a folder of spreadsheets. It&apos;s all here, and it all
              talks to itself.
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

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>How it works</span>
            <h2 className={styles.h2}>Set up once. Then just work.</h2>
          </div>
          <div className={styles.steps}>
            {STEPS.map((step) => (
              <div key={step.index} className={styles.step}>
                <span className={styles.stepIndex}>{step.index}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Client portal</span>
              <h2 className={styles.h3}>Give clients a window, not your inbox.</h2>
              <p className={styles.cardText}>
                Every client gets a branded portal with exactly what they should see — project progress, shared
                files, invoices they can pay — and nothing they shouldn&apos;t.
              </p>
              <ul className={styles.splitList}>
                <li>Live project status and shared files</li>
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
              <span className={styles.eyebrow}>Collaboration canvas</span>
              <h2 className={styles.h3}>A shared wall for every project.</h2>
              <p className={styles.cardText}>
                Pin notes and images on a freeform canvas the team and the client arrange together, in real time —
                with reactions and comments right on the card.
              </p>
              <ul className={styles.splitList}>
                <li>Live cursors-free sync over websockets</li>
                <li>Client and team edit the same board</li>
                <li>Comments and reactions per card</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/canvas.webp"
                alt="A project's collaboration canvas with colour-coded notes from the team and client."
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
                Your numbering, your terms, your currency. Draft from a project, send, and watch payments land —
                with reminders you can draft in a click.
              </p>
              <ul className={styles.splitList}>
                <li>Your prefix, padding and due terms</li>
                <li>Partial payments and overdue tracking</li>
                <li>Clients pay straight from the portal</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/invoicing.webp"
                alt="An issued invoice in Binx with line items, totals and payment status."
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
