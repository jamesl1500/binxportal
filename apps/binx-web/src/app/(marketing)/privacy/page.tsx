/**
 * page.tsx - Privacy Policy
 *
 * SCAFFOLD — real, structured content describing what Binx actually
 * collects and why (matches the current codebase: Stripe for billing, AWS
 * SES for outbound email, Anthropic Claude for the AI assistant, the client
 * portal, auth cookies), but the bracketed placeholders (registered entity,
 * governing jurisdiction, data-retention specifics, a dedicated privacy
 * contact if desired) need the business's own decisions filled in, and the
 * whole page needs a legal review pass before it's treated as binding. Not
 * indexed until that review happens — flip `robots` once it's reviewed.
 *
 * @module apps/binx-web/src/app/(marketing)/privacy/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { marketingOpenGraph, SITE } from "@/lib/site";

import styles from "../marketing.module.scss";

const TITLE = "Privacy Policy";
const DESCRIPTION = `How ${SITE.name} collects, uses, and protects your information, and your agency's and clients' data.`;
const LAST_UPDATED = "This draft has not yet been published — no effective date until it's reviewed and finalized.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  // Scaffold content — keep it out of search results until a real legal
  // review pass gives it an effective date. Remove this once that happens.
  robots: { index: false, follow: true },
  ...marketingOpenGraph(TITLE, DESCRIPTION, "/privacy"),
};

const PrivacyPage = () => {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>Legal</span>
            <h1 className={styles.h1}>Privacy Policy</h1>
            <p className={styles.lead}>
              What {SITE.name} collects, why, and what you and your clients can do about it.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.sectionTight}>
        <div className={styles.narrow}>
          <div className={styles.prose}>
            <p className={styles.proseMeta}>{LAST_UPDATED}</p>

            <p className={styles.proseNotice}>
              <strong>This is a scaffold, not a finished legal document.</strong> The sections below accurately
              describe what {SITE.name}&apos;s product actually does today, but the bracketed placeholders need this
              business&apos;s own answers, and the whole page needs a review by qualified counsel before it&apos;s
              published as binding. Don&apos;t rely on it as-is.
            </p>

            <h2>Overview</h2>
            <p>
              This policy explains what information {SITE.name} (&quot;{SITE.name}&quot;, &quot;we&quot;,
              &quot;us&quot;) collects when an agency and its team use the product, when that agency&apos;s clients
              use the client portal, and when someone simply visits this marketing site. It applies to
              [<strong>legal entity name and address</strong>], the company behind {SITE.name}.
            </p>

            <h2>Information we collect</h2>
            <h3>Account information</h3>
            <p>
              When someone signs up, we collect a name, email address, and password (stored hashed, never in plain
              text). An account can optionally add a phone number, job title, profile photo, and short bio.
            </p>
            <h3>Agency and workspace data</h3>
            <p>
              Everything an agency enters to run its business through {SITE.name} — clients, leads, projects, tasks,
              files, invoices, and internal messages — is stored so the product can do its job. This data belongs to
              the agency that entered it, not to us.
            </p>
            <h3>Client portal data</h3>
            <p>
              A client invited to an agency&apos;s portal gets their own contact record (name, email) and can see
              the project status, files, invoices, and messages their agency has shared with them. A portal contact
              never sees another client&apos;s data, and never counts as a billed seat.
            </p>
            <h3>Payment information</h3>
            <p>
              Subscription payments are processed by Stripe. We do not store full card numbers on our own servers —
              Stripe handles that, under its own privacy policy.
            </p>
            <h3>Usage and log data</h3>
            <p>
              Like most web applications, our servers log standard technical data (IP address, browser type,
              timestamps, pages requested) for security, debugging, and abuse prevention.
            </p>

            <h2>Cookies and authentication</h2>
            <p>
              {SITE.name} uses a small number of strictly-necessary cookies to keep a signed-in session working —
              they carry an authentication token, not an advertising identifier. We don&apos;t use third-party
              advertising or cross-site tracking cookies on the application itself.
            </p>

            <h2>The AI assistant</h2>
            <p>
              {SITE.name}&apos;s AI features (lead scoring, the assistant that answers questions about an
              agency&apos;s own leads, clients, projects, and invoices) are powered by Anthropic&apos;s Claude
              models. Requests sent to Anthropic are limited to what&apos;s needed to answer the specific question
              asked, are not used to train Anthropic&apos;s models under our agreement with them, and every account
              can see and manage how much AI usage its team is spending.
            </p>

            <h2>Who we share information with</h2>
            <p>
              We don&apos;t sell personal information, and we don&apos;t share agency or client data with third
              parties for their own marketing purposes. We do share the minimum necessary information with a small
              set of service providers who help us run {SITE.name}:
            </p>
            <ul>
              <li>
                <strong>Stripe</strong> — payment processing for paid subscription plans.
              </li>
              <li>
                <strong>Anthropic</strong> — powers the optional AI assistant and lead-scoring features.
              </li>
              <li>
                <strong>Amazon Web Services</strong> — hosting, file storage, and outbound transactional email
                (account verification, password resets, invitations, notifications).
              </li>
            </ul>
            <p>
              We may also disclose information if required by law, or to protect the rights, property, or safety of
              {SITE.name}, our users, or others.
            </p>

            <h2>Data retention and deletion</h2>
            <p>
              We keep account and workspace data for as long as an account is active. An agency owner can permanently
              delete their account from Account settings, which removes their profile information; [
              <strong>specify how long workspace/agency data persists after an account or agency is deleted, and any
              backup-retention window</strong>].
            </p>

            <h2>Your rights</h2>
            <p>
              Depending on where you&apos;re located, you may have rights to access, correct, export, or delete your
              personal information, and to object to or restrict certain processing. Most of this you can already do
              directly from Account and Profile settings — for anything else, contact us at{" "}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. [<strong>Add region-specific rights language — e.g.
              GDPR (EU/UK) or CCPA/CPRA (California) — if the business serves users in those regions.</strong>]
            </p>

            <h2>Security</h2>
            <p>
              We use industry-standard measures to protect information — encrypted connections (TLS), hashed
              passwords, and access controls that scope every request to the signed-in user&apos;s own agency. No
              method of transmission or storage is perfectly secure, and we can&apos;t guarantee absolute security.
            </p>

            <h2>Children&apos;s privacy</h2>
            <p>{SITE.name} is a business tool and isn&apos;t directed at, or knowingly used by, children under 16.</p>

            <h2>International data transfers</h2>
            <p>
              [<strong>State where data is hosted/processed (e.g. AWS region) and, if the business serves users
              outside that region, how cross-border transfers are handled.</strong>]
            </p>

            <h2>Changes to this policy</h2>
            <p>
              If we make a material change to this policy, we&apos;ll update the date at the top of this page and,
              for significant changes, notify account owners directly.
            </p>

            <h2>Contact us</h2>
            <p>
              Questions about this policy or your data can go to{" "}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>, or see the <Link href="/contact">Contact</Link>{" "}
              page.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default PrivacyPage;
