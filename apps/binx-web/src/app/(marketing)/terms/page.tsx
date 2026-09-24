/**
 * page.tsx - Terms of Service
 *
 * Real, structured content describing how Binx's product actually works
 * today (accounts, plans, the client portal, AI features, billing via
 * Stripe). Business-decision placeholders (registered entity, governing
 * law/venue, liability cap) are filled with reasonable defaults — see
 * LEGAL_ASSUMPTIONS in privacy/page.tsx for what to confirm or change
 * before treating this as final, and have qualified counsel review it
 * before that.
 *
 * @module apps/binx-web/src/app/(marketing)/terms/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { marketingOpenGraph, SITE } from "@/lib/site";

import styles from "../marketing.module.scss";

const TITLE = "Terms of Service";
const DESCRIPTION = `The terms that govern using ${SITE.name} — accounts, plans and billing, the client portal, and what each side is responsible for.`;
const LAST_UPDATED = "Effective September 24, 2026";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/terms"),
};

const TermsPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Legal</span>
            <h1 className={styles.h1}>Terms of Service</h1>
            <p className={styles.lead}>The terms that govern using {SITE.name}.</p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.narrow}>
          <div className={styles.prose}>
            <p className={styles.proseMeta}>{LAST_UPDATED}</p>

            <h2>Agreement to these terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) are an agreement between you and Binx, Inc.
              (&quot;{SITE.name}&quot;, &quot;we&quot;, &quot;us&quot;) governing your use of the {SITE.name}{" "}
              application and this website. By creating an account or using {SITE.name}, you agree to these Terms.
              See also our <Link href="/privacy">Privacy Policy</Link>.
            </p>

            <h2>Accounts</h2>
            <p>
              You need an account to use {SITE.name}, and you&apos;re responsible for the accuracy of the
              information you provide and for keeping your login credentials secure. You must be at least 18 years
              old, and acting on behalf of a business you have the authority to bind, to create an account.
            </p>

            <h2>Plans and billing</h2>
            <p>
              {SITE.name} offers a Free plan and paid Starter, Pro, and Scale plans, each with its own limits on
              clients, projects, leads, team members, and AI usage — see <Link href="/pricing">Pricing</Link> for
              current details. Paid subscriptions are billed in advance on a recurring basis through Stripe, our
              payment processor, and auto-renew until cancelled. You can change or cancel a plan at any time from
              Settings. Cancelling stops the next renewal but doesn&apos;t refund the current billing period; an
              upgrade takes effect immediately with a prorated charge for the rest of the current period, and a
              downgrade takes effect at the start of the next billing period.
            </p>

            <h2>Your data and content</h2>
            <p>
              Everything you or your team enters into {SITE.name} — client records, projects, files, invoices, and
              messages — belongs to you. We don&apos;t claim ownership of it, we don&apos;t sell it, and we don&apos;t
              use it to train AI models. We only access it to operate the product, provide support at your request,
              or as required by law. You&apos;re responsible for having the right to upload and share any content
              you put into {SITE.name}, including anything shared with your clients through the portal.
            </p>

            <h2>The client portal</h2>
            <p>
              If you invite a client to your portal, you&apos;re responsible for that relationship and for what you
              choose to share with them. {SITE.name} gives portal contacts visibility only into what their own
              agency has explicitly shared for their project — an agency is responsible for confirming a portal
              invite reaches the right person.
            </p>

            <h2>AI features</h2>
            <p>
              {SITE.name}&apos;s optional AI features (lead scoring, the dashboard briefing, drafted summaries and
              reminders, the AI assistant, and the AI lead prospector) are provided to help, not as a substitute for
              your own judgment. They can be wrong. You&apos;re responsible for reviewing AI-generated content — a
              drafted message, a lead score, a prospect suggestion, a summary — before relying on or sending it. The
              AI lead prospector, when you enable it, sends the search criteria you enter to Google Places to find
              matching businesses; you&apos;re responsible for having the right to search for and contact any
              business it surfaces. Each agency can monitor and cap its own AI usage in Settings.
            </p>

            <h2>Acceptable use</h2>
            <p>You agree not to use {SITE.name} to:</p>
            <ul>
              <li>Violate any applicable law, or the rights of any third party;</li>
              <li>Upload malicious code, or attempt to gain unauthorized access to the service;</li>
              <li>Interfere with or disrupt the service, or attempt to circumvent its plan limits;</li>
              <li>Resell or provide the service to third parties as your own product, without our written consent.</li>
            </ul>

            <h2>Termination</h2>
            <p>
              You can delete your account at any time from Account settings. We may suspend or terminate an account
              that violates these Terms, with notice where practical. After termination, your workspace data is
              available for you to export for 30 days, and is then permanently deleted, including from backups,
              within 90 days — the same schedule described in our <Link href="/privacy">Privacy Policy</Link>.
            </p>

            <h2>Service availability</h2>
            <p>
              We aim to keep {SITE.name} available and reliable, but we don&apos;t guarantee uninterrupted access —
              the service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without warranties
              of any kind, express or implied, to the fullest extent permitted by law.
            </p>

            <h2>Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, {SITE.name} won&apos;t be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill,
              arising from your use of the service. Our total liability for any claim relating to {SITE.name} is
              limited to the amount you paid us in the 12 months before the claim arose, or $100 if you&apos;re on
              the Free plan.
            </p>

            <h2>Changes to these terms</h2>
            <p>
              If we make a material change to these Terms, we&apos;ll update the date at the top of this page and,
              for significant changes, notify account owners directly. Continued use of {SITE.name} after a change
              takes effect means you accept the updated Terms.
            </p>

            <h2>Governing law</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-laws
              principles. Any dispute arising from these Terms or your use of {SITE.name} will be resolved in the
              state or federal courts located in Delaware, and you consent to their jurisdiction.
            </p>

            <h2>Contact us</h2>
            <p>
              Questions about these Terms can go to <a href={`mailto:${SITE.email}`}>{SITE.email}</a>, or see the{" "}
              <Link href="/contact">Contact</Link> page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default TermsPage;
