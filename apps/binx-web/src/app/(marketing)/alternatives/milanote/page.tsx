/**
 * page.tsx - Milanote alternative
 *
 * Landing page for "milanote alternative" search intent. Milanote is a
 * well-loved visual board for organising creative ideas; this page speaks to
 * agencies who like that way of working but need the board joined to the
 * rest of the business — tasks, client sign-off, a client portal, proposals
 * and invoicing. Claims about Milanote are kept to what it's built for
 * (visual boards); nothing here asserts features it lacks beyond the
 * agency-operations side, which it doesn't set out to do.
 *
 * @module apps/binx-web/src/app/(marketing)/alternatives/milanote/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CheckCheck, ListChecks, Receipt } from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const PATH = "/alternatives/milanote";
const TITLE = "Milanote alternative for agencies";
const DESCRIPTION =
  "Like Milanote's visual boards? Binx gives agencies the same way of working, joined to real tasks, client approvals, a client portal and invoicing.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  ...marketingOpenGraph(TITLE, DESCRIPTION, PATH),
};

const GAPS = [
  {
    icon: ListChecks,
    title: "Boards and tasks drift apart",
    text: "A to-do list on a board is easy to start and easy to lose track of once the real task list lives somewhere else. In Binx, canvas to-do rows are the project's tasks, on the Kanban and in everyone's My work.",
  },
  {
    icon: CheckCheck,
    title: "Sign-off needs a record",
    text: "When a client picks a direction, an agency needs to know exactly which version they picked. Binx pins each approval to a snapshot of the card, and keeps it in the history.",
  },
  {
    icon: Receipt,
    title: "The business lives elsewhere",
    text: "Proposals, the client portal and invoicing usually mean three more tools around the board. In Binx they're on the same client record as the project.",
  },
];

const FAQ = [
  {
    q: "Does the Binx canvas work like Milanote?",
    a: "It's the same style of visual board: notes, images, links, files, to-do lists, columns, boards inside boards and connector lines, with a card rail you drag from. The difference is what it's connected to. Binx to-do rows are project tasks, and cards can go to the client for approval.",
  },
  {
    q: "Can I import my Milanote boards?",
    a: "There's no automated importer today. Most agencies start new projects in Binx and keep older boards where they are. You can drag images and files straight onto a Binx canvas, and pasting a link makes a link card.",
  },
  {
    q: "When is Milanote the better fit?",
    a: "If you mainly need a personal or team space to collect ideas, and your clients, tasks and billing are handled elsewhere, a dedicated board tool may be all you need. Binx is for agencies that want the board, the client and the work in one place.",
  },
  {
    q: "Is there a free plan to try it?",
    a: "Yes. The Free plan needs no card and has no time limit, so you can run a real project and a real client review through it before deciding.",
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

const MilanoteAlternativePage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd(TITLE, PATH)]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Milanote alternative</span>
            <h1 className={styles.h1}>
              A Milanote alternative where the board runs the project.
            </h1>
            <p className={styles.lead}>
              Milanote is a lovely place to organise creative ideas.{" "}
              {SITE.name} keeps that visual way of working, then connects the
              board to everything around it: real tasks, client sign-off, a
              branded client portal, proposals and invoicing.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/visual-canvas" className={styles.btnGhost}>
                Tour the canvas
              </Link>
            </div>
            <p className={styles.heroNote}>
              Free plan available · no card required.
            </p>
          </div>
          <figure className={styles.heroShot}>
            <Image
              src="/marketing/canvas.webp"
              alt="The Binx project canvas: a column of logo directions out for client review, a launch checklist of real project tasks, notes, a link and a file."
              width={1600}
              height={1138}
              sizes="(min-width: 1100px) 68rem, 100vw"
              priority
            />
          </figure>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Where agencies outgrow a board</span>
            <h2 className={styles.h2}>
              Great for ideas. Agencies also need the work around them.
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
              What you get
            </span>
            <h2 className={styles.h2}>The board you like, joined to the agency.</h2>
          </div>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>On the canvas</h3>
              <ul className={styles.splitList}>
                <li>Notes, images, links, files, columns and connector lines</li>
                <li>Boards inside boards, with breadcrumbs</li>
                <li>To-do lists whose rows are the project&apos;s real tasks</li>
                <li>Live editing with your team and your client</li>
              </ul>
            </div>
            <div className={styles.splitBody}>
              <h3 className={styles.h3}>Around it</h3>
              <ul className={styles.splitList}>
                <li>Client approvals on a card or a whole column, with versions</li>
                <li>A branded client portal for progress, files and messages</li>
                <li>Proposals with e-sign and invoices clients pay online</li>
                <li>Kanban boards, time tracking and a team dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.split}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Client sign-off</span>
              <h2 className={styles.h3}>Your client reviews right on the board.</h2>
              <p className={styles.cardText}>
                Send a column of options for review and your client steps
                through them in their portal, approving or asking for changes.
                Every decision is kept against the exact version they saw.
              </p>
              <Link href="/client-approvals" className={styles.faqFooterLink}>
                How client approvals work →
              </Link>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/approvals.webp"
                alt="A client reviewing a column of logo directions, with Approve all and Request changes."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`}>
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
        heading="Bring your next project onto the canvas."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default MilanoteAlternativePage;
