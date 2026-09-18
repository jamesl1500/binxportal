/**
 * page.tsx - Terms of Service
 *
 * SCAFFOLD — real, structured content describing how Binx's product
 * actually works today (accounts, plans, the client portal, AI features,
 * billing via Stripe), but the bracketed placeholders (registered entity,
 * governing law/venue, dispute-resolution mechanism, liability cap) need
 * this business's own decisions, and the whole page needs a review by
 * qualified counsel before it's treated as binding. Not indexed until that
 * review happens — flip `robots` once it's reviewed. See privacy/page.tsx
 * for the same scaffold pattern.
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
const LAST_UPDATED = "This draft has not yet been published — no effective date until it's reviewed and finalized.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  // Scaffold content — keep it out of search results until a real legal
  // review pass gives it an effective date. Remove this once that happens.
  robots: { index: false, follow: true },
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

            <p className={styles.proseNotice}>
              <strong>This is a scaffold, not a finished legal document.</strong> The sections below accurately
              describe how {SITE.name}&apos;s product actually works today, but the bracketed placeholders need this
              business&apos;s own answers, and the whole page needs a review by qualified counsel before it&apos;s
              published as binding. Don&apos;t rely on it as-is.
            </p>

            <h2>Agreement to these terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) are an agreement between you and [
              <strong>legal entity name and address</strong>] (&quot;{SITE.name}&quot;, &quot;we&quot;,
              &quot;us&quot;) governing your use of the {SITE.name} application and this website. By creating an
              account or using {SITE.name}, you agree to these Terms. See also our{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>

            <h2>Accounts</h2>
            <p>
              You need an account to use {SITE.name}, and you&apos;re responsible for the accuracy of the
              information you provide and for keeping your login credentials secure. You must be at least 16 years
              old — [<strong>confirm the minimum age required, and any additional requirement that account holders
              act on behalf of a business</strong>] — to create an account.
            </p>

            <h2>Plans and billing</h2>
            <p>
              {SITE.name} offers a Free plan and paid Starter, Pro, and Scale plans, each with its own limits on
              clients, projects, leads, team members, and AI usage — see <Link href="/pricing">Pricing</Link> for
              current details. Paid subscriptions are billed in advance on a recurring basis through Stripe, our
              payment processor, and auto-renew until cancelled. You can change or cancel a plan at any time from
              Settings; [<strong>state the refund policy for the current and any prior billing period, and how
              mid-cycle downgrades/upgrades are prorated</strong>].
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
              {SITE.name}&apos;s optional AI features (lead scoring, the AI assistant) are provided to help, not as
              a substitute for your own judgment. They can be wrong. You&apos;re responsible for reviewing
              AI-generated content — a drafted message, a lead score, a summary — before relying on or sending it.
              Each agency can monitor and cap its own AI usage in Settings.
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
              that violates these Terms, with notice where practical. [<strong>State what happens to workspace data
              after termination — export window, deletion timeline.</strong>]
            </p>

            <h2>Service availability</h2>
            <p>
              We aim to keep {SITE.name} available and reliable, but we don&apos;t guarantee uninterrupted access —
              the service is provided on an &quot;as is&quot; and &quot;as available&quot; basis, without warranties
              of any kind, express or implied, to the fullest extent permitted by law.
            </p>

            <h2>Limitation of liability</h2>
            <p>
              [<strong>Standard limitation-of-liability language belongs here — e.g. a cap on damages tied to fees
              paid in the prior 12 months, and exclusion of indirect/consequential damages — drafted or reviewed by
              counsel for the jurisdiction(s) this business operates in.</strong>]
            </p>

            <h2>Changes to these terms</h2>
            <p>
              If we make a material change to these Terms, we&apos;ll update the date at the top of this page and,
              for significant changes, notify account owners directly. Continued use of {SITE.name} after a change
              takes effect means you accept the updated Terms.
            </p>

            <h2>Governing law</h2>
            <p>
              [<strong>State the governing law and venue for disputes — e.g. the laws of [State/Country], with
              disputes resolved in the courts of [City, State] — and whether an arbitration clause applies.</strong>]
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
