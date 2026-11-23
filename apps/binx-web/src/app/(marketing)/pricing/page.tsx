/**
 * page.tsx - Pricing
 *
 * The four plans, what separates them, the fee on invoices clients pay
 * online (with a worked example), and the questions people ask before
 * signing up. FAQ content is mirrored into FAQPage JSON-LD for rich results.
 *
 * @module apps/binx-web/src/app/(marketing)/pricing/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import {
  LAUNCH_DISCOUNT_ENABLED,
  PLANS,
  TRIAL_DAYS,
  TRIAL_DISCOUNT_PERCENT_OFF,
  breadcrumbJsonLd,
  marketingOpenGraph,
  softwareApplicationJsonLd,
} from "@/lib/site";
import { formatMoneyCents } from "@/lib/money";
import {
  PLATFORM_FEE_LABEL,
  STRIPE_ESTIMATE_LABEL,
  estimateOnlinePayment,
} from "@/lib/payment-fees";
import MarketingCta from "@/components/marketing/MarketingCta/MarketingCta";

import styles from "../marketing.module.scss";

const TITLE = "Pricing";
// <title> / social title: searchable, not just the nav label (TITLE stays the
// short breadcrumb name). Kept to 60 characters with the " · Binx Portal" suffix.
const SEO_TITLE = "Agency software pricing, free plan included";
const DESCRIPTION =
  "Start free, then Starter, Pro or Scale with a 14-day free trial, no card needed. Plus 1.25% on invoices clients pay online. Portal, invoicing and AI included.";

// The worked example under the plans: a typical project invoice.
const EXAMPLE_INVOICE_CENTS = 250_000;
const example = estimateOnlinePayment(EXAMPLE_INVOICE_CENTS);

export const metadata: Metadata = {
  title: SEO_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  ...marketingOpenGraph(SEO_TITLE, DESCRIPTION, "/pricing"),
};

const FAQ = [
  {
    q: "Is there really a free plan?",
    a: "Yes. The Free plan doesn't expire and doesn't need a card. It's capped on clients, projects, leads and AI usage — when you outgrow it, upgrading takes a minute through Stripe's secure checkout.",
  },
  {
    q: `Can I try Starter, Pro or Scale before paying?`,
    a: LAUNCH_DISCOUNT_ENABLED
      ? `Yes. Every paid plan starts with a ${TRIAL_DAYS}-day free trial — no card required. Upgrade during the trial, or within two weeks after it ends, and you'll get ${TRIAL_DISCOUNT_PERCENT_OFF}% off your first 3 months.`
      : `Yes. Every paid plan starts with a ${TRIAL_DAYS}-day free trial — no card required. Upgrade whenever you're ready.`,
  },
  {
    q: "Are there fees on invoice payments?",
    a: `Only when a client pays an invoice online through the portal, into the Stripe account you connect for your agency. Binx keeps ${PLATFORM_FEE_LABEL} of the payment, and Stripe takes its standard processing fee (${STRIPE_ESTIMATE_LABEL} for US cards). Both come out of the payment, so your client pays exactly the invoice amount. Invoices paid by bank transfer, check or cash and recorded by hand have no fee, and every invoice shows you what you'll keep before you send it.`,
  },
  {
    q: "Do you charge per seat?",
    a: "No. Each plan includes a generous team-member allowance and the price is flat. You're billed for the plan, not the headcount.",
  },
  {
    q: "What counts as AI usage?",
    a: "Every AI action (finding prospects, scoring a lead, drafting a reminder, summarising a project, asking the assistant) draws against a monthly budget set by your plan. An owner can see the spend and cap individual users in Settings.",
  },
  {
    q: "Are proposals included on every plan?",
    a: "Yes. Every plan, Free included, can build proposals, send them as a link and collect an online signature. Signed proposals show up on the client record and in their portal.",
  },
  {
    q: "Can clients use the portal for free?",
    a: "Yes. Client-portal contacts never count toward your team-member limit and are never billed.",
  },
  {
    q: "Can I change plans later?",
    a: "Any time, in both directions, through Stripe's billing portal. Upgrades apply right away. If a downgrade puts you over a limit, nothing is deleted: you just can't add more of that item until you're back under it.",
  },
  {
    q: "Where does my data live?",
    a: "On Amazon Web Services in the United States, and you can export it whenever you want. We don't sell it and we don't train models on it.",
  },
  {
    q: "Can I run more than one agency?",
    a: "Yes. You can own 1 agency on Free, 2 on Starter, 5 on Pro and as many as you like on Scale, based on the highest plan among the agencies you own. Each agency has its own clients, team, plan and Stripe account, so nothing mixes.",
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            faqJsonLd,
            softwareApplicationJsonLd(PLANS.map((plan) => `${plan.name} plan`)),
            breadcrumbJsonLd(TITLE, "/pricing"),
          ]),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Pricing</span>
            <h1 className={styles.h1}>Plans that grow with the agency.</h1>
            <p className={styles.lead}>
              Start free, upgrade when the work does. Every plan includes
              proposals, the client portal, invoicing and AI. The tiers just
              change how much of everything you get.
            </p>
            <p className={styles.lead}>
              {LAUNCH_DISCOUNT_ENABLED
                ? `Trying Starter, Pro or Scale? Get ${TRIAL_DAYS} days free, no card required — convert during the trial or shortly after and take ${TRIAL_DISCOUNT_PERCENT_OFF}% off your first 3 months.`
                : `Trying Starter, Pro or Scale? Get ${TRIAL_DAYS} days free, no card required.`}
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <div className={styles.priceGrid}>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={styles.priceCard}
                data-featured={plan.featured}
              >
                <p className={styles.priceName}>{plan.name}</p>
                <p className={styles.priceTag}>${plan.price}</p>
                <p className={styles.pricePer}>
                  {plan.price === 0 ? "forever" : "per month"}
                </p>
                <p className={styles.priceFee}>
                  + {PLATFORM_FEE_LABEL} per invoice paid online
                </p>
                <p className={styles.priceBlurb}>{plan.blurb}</p>
                {plan.price > 0 && (
                  <p className={styles.priceBlurb}>
                    {TRIAL_DAYS} days free, no card needed.
                  </p>
                )}
                <ul className={styles.priceList}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link
                  href={`/auth/signup?plan=${plan.name.toLowerCase()}`}
                  className={styles.priceCta}
                  data-featured={plan.featured}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className={styles.feeNote}>
            <div className={styles.feeNoteBody}>
              <h2 className={styles.h3}>
                Plus {PLATFORM_FEE_LABEL} when clients pay online.
              </h2>
              <p className={styles.cardText}>
                When a client pays an invoice from their portal, Binx keeps{" "}
                {PLATFORM_FEE_LABEL} and Stripe takes its processing fee. Both
                come out of the payment, so your client pays the invoice
                amount and nothing more. Bank transfers, checks and cash you
                record by hand are free.
              </p>
            </div>
            <dl
              className={styles.feeExample}
              aria-label={`Example: a ${formatMoneyCents(EXAMPLE_INVOICE_CENTS)} invoice paid online`}
            >
              <div>
                <dt>Invoice paid online</dt>
                <dd>{formatMoneyCents(example.grossCents)}</dd>
              </div>
              <div>
                <dt>Stripe processing ({STRIPE_ESTIMATE_LABEL})</dt>
                <dd>−{formatMoneyCents(example.stripeFeeCents)}</dd>
              </div>
              <div>
                <dt>Binx ({PLATFORM_FEE_LABEL})</dt>
                <dd>−{formatMoneyCents(example.platformFeeCents)}</dd>
              </div>
              <div className={styles.feeExampleNet}>
                <dt>You keep</dt>
                <dd>{formatMoneyCents(example.netCents)}</dd>
              </div>
            </dl>
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

      <MarketingCta
        heading="Try it on the free plan."
        sub="No card, no time limit. Upgrade the day it pays off."
      />
    </>
  );
};

export default PricingPage;
