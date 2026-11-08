/**
 * page.tsx - Visual canvas
 *
 * Feature deep-dive for "visual project board" / "moodboard tool for
 * agencies" / "visual collaboration with clients" search intent: the
 * Milanote-style project canvas — notes, images, links, files, columns,
 * nested boards, connector lines, and to-do lists that are the project's real
 * tasks. Screenshots come from e2e/capture-marketing.spec.ts.
 *
 * @module apps/binx-web/src/app/(marketing)/visual-canvas/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Columns3,
  LayoutGrid,
  Link2,
  ListChecks,
  MoveUpRight,
  Paperclip,
  Radio,
  StickyNote,
} from "lucide-react";

import { breadcrumbJsonLd, marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const PATH = "/visual-canvas";
const TITLE = "Visual project canvas for agencies and clients";
const DESCRIPTION =
  "Moodboards, columns, nested boards, links, files and to-do lists that are your real project tasks, on one live canvas your team and client share.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  keywords: [
    "visual project canvas",
    "moodboard tool for agencies",
    "visual collaboration with clients",
    "creative project board",
    "client moodboard",
    "visual task board",
  ],
  ...marketingOpenGraph(TITLE, DESCRIPTION, PATH),
};

const CARDS = [
  {
    icon: StickyNote,
    title: "Notes & images",
    text: "Drop ideas, references and drafts anywhere on the board. Drag a file in from your desktop, or paste an image straight from the clipboard.",
  },
  {
    icon: ListChecks,
    title: "To-do lists that are real tasks",
    text: "Every row on a canvas to-do list is a project task, so it also shows on the Kanban board and in My work. Tick it on the canvas and it moves to Done.",
  },
  {
    icon: Columns3,
    title: "Columns",
    text: "Stack cards into a titled column to group options, references or a sequence. Drag cards in, out and between columns.",
  },
  {
    icon: LayoutGrid,
    title: "Boards inside boards",
    text: "A board card opens its own canvas, with breadcrumbs back up. A moodboard, a shot list, a launch plan: each gets room to breathe.",
  },
  {
    icon: Link2,
    title: "Links with previews",
    text: "Paste a URL and get a card with the page's title, summary and image, ready for a client to click through.",
  },
  {
    icon: Paperclip,
    title: "Files",
    text: "PDFs, decks and documents sit on the board as cards and on the project's Files tab, one click to download.",
  },
  {
    icon: MoveUpRight,
    title: "Connector lines",
    text: "Draw a line from one card to another to show what leads where: research to brief, brief to checklist.",
  },
  {
    icon: Radio,
    title: "Live with your client",
    text: "Your team and your client's contacts work on the same board in real time, from the agency app and the client portal.",
  },
];

const FAQ = [
  {
    q: "How is this different from a Kanban board?",
    a: "You get both. The Kanban board keeps tasks in tidy columns by status. The canvas is the free-form space around the work: references, options, files and notes, with to-do lists that are those same tasks. Change a task in either place and the other updates.",
  },
  {
    q: "Can clients edit the canvas?",
    a: "Yes. Clients collaborate from their portal: they can add notes, images, links and files, comment and react, and approve or request changes on cards you send for review. To-do lists are read-only for them, because those rows are your team's tasks.",
  },
  {
    q: "Can I organise a big project into several boards?",
    a: "Yes. Add a board card and it opens a canvas of its own, which can hold more board cards. Breadcrumbs across the top take you back up, and you can drag a card onto a board card to move it inside.",
  },
  {
    q: "Is the canvas on the Free plan?",
    a: "Yes. Every project on every plan has a canvas, including Free, which needs no card.",
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

const VisualCanvasPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd("Visual canvas", PATH)]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Visual canvas</span>
            <h1 className={styles.h1}>
              Plan the project the way creative people think.
            </h1>
            <p className={styles.lead}>
              Every {SITE.name} project has a visual canvas: moodboards, options
              in columns, links, files and to-do lists that are your real
              tasks. Your team and your client build it together, live.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Get started free
              </Link>
              <Link href="/client-approvals" className={styles.btnGhost}>
                See client approvals
              </Link>
            </div>
            <p className={styles.heroNote}>
              On every project, on every plan · no card required.
            </p>
          </div>
          <figure className={styles.heroShot}>
            <Image
              src="/marketing/canvas.webp"
              alt="A project canvas with a column of logo directions, a brand launch checklist of project tasks, a moodboard card, kick-off notes, a link preview and a PDF."
              width={1600}
              height={1138}
              sizes="(min-width: 1100px) 68rem, 100vw"
              priority
            />
          </figure>
          <p className={styles.heroShotCaption}>
            The card rail on the left: drag a note, to-do list, link, column,
            board, line, image or file onto the board.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Everything on one board</span>
            <h2 className={styles.h2}>Cards for every part of the work.</h2>
          </div>
          <div className={styles.grid}>
            {CARDS.map(({ icon: Icon, title, text }) => (
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
              <span className={styles.eyebrow}>Nested boards</span>
              <h2 className={styles.h3}>Give every idea its own space.</h2>
              <p className={styles.cardText}>
                A board card opens a canvas of its own. Keep the moodboard,
                the palette and the references a click away from the project
                board, without cluttering it. Breadcrumbs show where you are,
                and the parent card counts what&apos;s waiting on the client
                inside.
              </p>
              <ul className={styles.splitList}>
                <li>Boards inside boards, as deep as the project needs</li>
                <li>Drag a card onto a board card to move it inside</li>
                <li>Pending reviews counted on the board card</li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/canvas-moodboard.webp"
                alt="A nested moodboard opened from the project canvas, with breadcrumbs, reference notes and a palette column."
                width={1600}
                height={1138}
                sizes="(min-width: 900px) 32rem, 100vw"
              />
            </div>
          </div>

          <div className={`${styles.split} ${styles.splitAlt}`}>
            <div className={styles.splitBody}>
              <span className={styles.eyebrow}>Client sign-off</span>
              <h2 className={styles.h3}>Present options, collect decisions.</h2>
              <p className={styles.cardText}>
                Group options into a column and send the whole thing to your
                client for review. They approve or request changes from their
                portal, and every decision is pinned to the version they saw.
              </p>
              <ul className={styles.splitList}>
                <li>Review one card or a whole column</li>
                <li>A guided review bar in the client portal</li>
                <li>
                  <Link href="/client-approvals">More on client approvals →</Link>
                </li>
              </ul>
            </div>
            <div className={styles.splitMedia}>
              <Image
                src="/marketing/approvals.webp"
                alt="A client approving a column of logo directions on the shared canvas."
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
            <h2 className={styles.h2}>About the canvas.</h2>
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
            Related: <Link href="/client-approvals">client approvals</Link>
            {" · "}
            <Link href="/alternatives/milanote">Binx as a Milanote alternative</Link>
            {" · "}
            <Link href="/for/design-studios">Binx for design studios</Link>
          </p>
        </div>
      </section>

      <MarketingCta
        heading="Open a canvas for your next project."
        sub="Free plan, no card, no time limit."
      />
    </>
  );
};

export default VisualCanvasPage;
