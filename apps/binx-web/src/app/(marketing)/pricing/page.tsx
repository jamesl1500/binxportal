/**
 * page.tsx - Pricing
 *
 * The four plans, what separates them, and the questions people ask before
 * signing up. FAQ content is mirrored into FAQPage JSON-LD for rich results.
 *
 * @module apps/binx-web/src/app/(marketing)/pricing/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple plans that scale with the agency — a free tier to get started, then Starter, Pro and Scale as you grow. No per-seat surprises.",
  alternates: { canonical: "/pricing" },
};

const PLANS = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    blurb: "For a solo operator or a first project.",
    features: ["1 agency workspace", "Up to 3 clients & 3 active projects", "25 leads", "3 team members", "Client portal & invoicing", "$10/mo of AI usage"],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Starter",
    price: "$49",
    per: "per month",
    blurb: "For a small studio finding its rhythm.",
    features: ["Everything in Free", "15 clients & 25 active projects", "250 leads", "10 team members", "Priority email support", "$50/mo of AI usage"],
    cta: "Start Starter",
    featured: false,
  },
  {
    name: "Pro",
    price: "$149",
    per: "per month",
    blurb: "For an agency running many clients at once.",
    features: ["Everything in Starter", "60 clients & 150 active projects", "2,000 leads", "40 team members", "$200/mo of AI usage"],
    cta: "Start Pro",
    featured: true,
  },
  {
    name: "Scale",
    price: "$399",
    per: "per month",
    blurb: "For a large team with no room for limits.",
    features: ["Everything in Pro", "Unlimited clients, projects & leads", "150 team members", "$750/mo of AI usage", "Onboarding help"],
    cta: "Start Scale",
    featured: false,
  },
];

const FAQ = [
  {
    q: "Is there really a free plan?",
    a: "Yes. The Free plan doesn't expire and doesn't need a card. It's capped on clients, projects, leads and AI usage — when you outgrow it, upgrading takes a minute through Stripe's secure checkout.",
  },
  {
    q: "Do you charge per seat?",
    a: "No. Each plan includes a generous team-member allowance and the price is flat. You're billed for the plan, not the headcount.",
  },
  {
    q: "What counts as AI usage?",
    a: "Every AI action — scoring a lead, drafting a reminder, summarising a project, asking the assistant — draws against a monthly budget set by your plan. An owner can see the spend and cap individual users in Settings.",
  },
  {
    q: "Can clients use the portal for free?",
    a: "Yes. Client-portal contacts never count toward your team-member limit and are never billed.",
  },
  {
    q: "Can I change plans later?",
    a: "Any time, in both directions, through Stripe's billing portal. Upgrades apply right away; if a downgrade would put you over a limit we'll tell you what to trim first.",
  },
  {
    q: "Where does my data live?",
    a: "In your workspace, exported whenever you want it. We don't sell it and we don't train models on it.",
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

const PricingPage = () => {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Pricing</span>
            <h1 className={styles.h1}>Plans that grow with the agency.</h1>
            <p className={styles.lead}>
              Start free, upgrade when the work does. Every plan includes the portal, invoicing and AI — the tiers
              just change how much of everything you get.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <div className={styles.priceGrid}>
            {PLANS.map((plan) => (
              <div key={plan.name} className={styles.priceCard} data-featured={plan.featured}>
                <p className={styles.priceName}>{plan.name}</p>
                <p className={styles.priceTag}>{plan.price}</p>
                <p className={styles.pricePer}>{plan.per}</p>
                <p className={styles.priceBlurb}>{plan.blurb}</p>
                <ul className={styles.priceList}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link href="/auth/signup" className={styles.priceCta} data-featured={plan.featured}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>Questions</span>
            <h2 className={styles.h2}>Before you sign up.</h2>
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

      <MarketingCta heading="Try it on the free plan." sub="No card, no time limit. Upgrade the day it pays off." />
    </>
  );
};

export default PricingPage;
