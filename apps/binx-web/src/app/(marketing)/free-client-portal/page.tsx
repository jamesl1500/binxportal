/**
 * page.tsx - Free client portal
 *
 * Landing page for "free client portal" search intent. Binx genuinely has a
 * $0 Free plan with the portal included and client contacts that never
 * count toward the team limit or get billed — an honest claim most
 * competitors in this space can't make, since it's not a trial or a
 * feature-gated tier.
 *
 * @module apps/binx-web/src/app/(marketing)/free-client-portal/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, PanelsTopLeft, Receipt } from "lucide-react";

import { marketingOpenGraph, SITE } from "@/lib/site";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "Free client portal";
const DESCRIPTION =
  "A real client portal on Binx's free plan — no card, no trial clock, no charge per client. Branded project status, files, invoicing and messaging your clients log into directly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/free-client-portal" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/free-client-portal"),
};

const INCLUDED = [
  {
    icon: PanelsTopLeft,
    title: "Live project status",
    text: "Clients see real progress on their project — not a static update you typed up, the same board your team works from.",
  },
  {
    icon: Receipt,
    title: "Invoices they can pay",
    text: "Every invoice you send shows up in their portal, payable directly — no separate payment link to track down.",
  },
  {
    icon: MessagesSquare,
    title: "Messages that keep context",
    text: "A thread tied to their project, not a shared inbox — the conversation stays attached to the work it's about.",
  },
];

const FAQ = [
  {
    q: "Is the free client portal actually free, or a trial?",
    a: "Free, ongoing, no card required and no time limit. It's part of the Free plan, which stays free — client-portal contacts specifically never count toward your team-member limit and are never billed, on any plan.",
  },
  {
    q: "How many clients can I put on it for free?",
    a: "The Free plan supports up to 3 clients and 3 active projects at once — each with its own full portal. Beyond that, paid plans raise the client and project caps, but the portal itself works the same way on every plan.",
  },
  {
    q: "Do I need a credit card to try it?",
    a: "No. Sign up, add a client, and their portal is ready — nothing to enter a card for unless and until you choose to upgrade.",
  },
  {
    q: "Can I put my own branding on it?",
    a: "Yes — the portal carries your agency's name and look, not Binx's. To the client, it's your workspace.",
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

const FreeClientPortalPage = () => {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Free client portal</span>
            <h1 className={styles.h1}>A real client portal. Actually free.</h1>
            <p className={styles.lead}>
              Not a trial, not a feature you unlock later — the {SITE.name} Free plan includes a full, branded
              client portal with no card required, and client-portal contacts never count toward your team limit or
              get billed on any plan.
            </p>
            <div className={`${styles.btnRow} ${styles.heroActions}`}>
              <Link href="/auth/signup" className={styles.btnPrimary}>
                Open your first portal free
              </Link>
              <Link href="/pricing" className={styles.btnGhost}>
                See the Free plan
              </Link>
            </div>
            <p className={styles.heroNote}>No card required · client contacts are never billed.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>What&apos;s actually in it</span>
            <h2 className={styles.h2}>Not a stripped-down version. The same portal on every plan.</h2>
          </div>
          <div className={styles.grid}>
            {INCLUDED.map(({ icon: Icon, title, text }) => (
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
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 className={styles.h2}>Before you open one.</h2>
          </div>
          <div className={styles.faq}>
            {FAQ.map((item) => (
              <div key={item.q} className={styles.faqItem}>
                <h3 className={styles.faqQ}>{item.q}</h3>
                <p className={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta heading="Open your first client portal." sub="Free plan, no card, no time limit." />
    </>
  );
};

export default FreeClientPortalPage;
