/**
 * page.tsx - vs. a Notion + Stripe + Drive stack
 *
 * The real competitor for most small agencies isn't another agency tool —
 * it's the DIY stack they've already cobbled together. This page speaks
 * directly to that, since it's honest ground: describing what each tool
 * actually is (a docs app, a payments API, a file drive) rather than
 * making claims about a named competitor's product.
 *
 * @module apps/binx-web/src/app/(marketing)/compare/notion-stripe-drive/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Link2, MessageSquareOff, ShieldQuestion } from "lucide-react";

import { marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../../marketing.module.scss";

const TITLE = "vs. a Notion + Stripe + Drive stack";
const DESCRIPTION =
  "Most small agencies aren't comparing tools — they're running one. See where a Notion + Stripe + Google Drive stack breaks down, and what one connected workspace looks like instead.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/compare/notion-stripe-drive" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/compare/notion-stripe-drive"),
};

const PROBLEMS = [
  {
    icon: Link2,
    title: "Nothing is actually connected",
    text: "A Notion page, a Stripe invoice, and a Drive folder for the same client have no idea the other two exist. Every update is manual, and every manual step is a place for something to go stale.",
  },
  {
    icon: ShieldQuestion,
    title: "Client access is all-or-nothing",
    text: "Sharing a Notion page or a Drive folder with a client means trusting Notion/Drive permissions to keep them out of everything else — and hoping nobody forwards a link past who it was meant for.",
  },
  {
    icon: MessageSquareOff,
    title: "No shared source of truth",
    text: "Payment status lives in Stripe. Project status lives in Notion, if it's up to date. Files live in Drive, versioned or not. Nobody — including you — has one page that says where things actually stand.",
  },
];

const FAQ = [
  {
    q: "Isn't a DIY stack cheaper?",
    a: "Often not once you count the time: re-entering client details in three places, chasing Stripe for payment status, and rebuilding a Drive folder structure per client all cost real hours. Binx's Free plan is $0 and replaces all three for a first client.",
  },
  {
    q: "Can I still use Notion or Drive alongside Binx?",
    a: "Sure — plenty of teams keep Notion for internal wikis or Drive for long-term archives. The difference is client work, project status, files, and invoicing no longer need to live split across all three.",
  },
  {
    q: "What does switching actually involve?",
    a: "Add your clients and open a project for each — most agencies have their first real client fully set up in under an hour, since there's nothing to migrate from a payments API or a docs tool, just clients and projects to re-create.",
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

const ComparePage = () => {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Binx vs. the DIY stack</span>
            <h1 className={styles.h1}>Your real competitor is Notion + Stripe + Drive.</h1>
            <p className={styles.lead}>
              Most small agencies aren&apos;t choosing between agency software — they&apos;re running client work
              across a docs app, a payments dashboard, and a shared drive, stitched together by memory. It works,
              until it doesn&apos;t.
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

      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <div className={styles.statRow}>
            <div>
              <p className={styles.statNum}>3</p>
              <p className={styles.statLabel}>separate logins for one client</p>
            </div>
            <div>
              <p className={styles.statNum}>0</p>
              <p className={styles.statLabel}>of them know about each other</p>
            </div>
            <div>
              <p className={styles.statNum}>1</p>
              <p className={styles.statLabel}>workspace once you switch</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Where it breaks down</span>
            <h2 className={styles.h2}>Each tool does its one job well. That&apos;s the problem.</h2>
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

      <section className={`${styles.section} ${styles.sectionDark}`}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={`${styles.eyebrow} ${styles.eyebrowOnDark}`}>One workspace instead</span>
            <h2 className={styles.h2}>What Notion, Stripe, and Drive were standing in for.</h2>
          </div>
          <div className={styles.gridTwo}>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>What Notion was for</h3>
              <p className={styles.cardText}>
                Project docs and task tracking. In {SITE.name}, that&apos;s a real project — task boards, a
                collaboration canvas the client can see, and files attached to the project they belong to.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>What Stripe was for</h3>
              <p className={styles.cardText}>
                Taking payment. {SITE.name} issues the invoice itself — your numbering, your terms — and the client
                pays straight from their portal, with the payment reflected against that project automatically.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>What Drive was for</h3>
              <p className={styles.cardText}>
                Sharing files with the client. In {SITE.name}, files live on the project itself, visible in the
                same portal as the invoice and the progress — no separate share link to manage or lose track of.
              </p>
            </article>
            <article className={styles.card}>
              <h3 className={styles.cardTitle}>What none of them did</h3>
              <p className={styles.cardText}>
                Give the client one place to see all of it, or give you a lead pipeline that turns into a client
                automatically. That&apos;s the part a stack of single-purpose tools can&apos;t do by design.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
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

      <MarketingCta heading="Give one client one workspace." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default ComparePage;
