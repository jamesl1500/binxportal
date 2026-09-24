/**
 * page.tsx - Privacy Policy
 *
 * Real, structured content describing what Binx actually collects and why
 * (matches the current codebase: Stripe for billing, AWS SES for outbound
 * email, Anthropic Claude for the AI features, Google Places for the AI
 * lead prospector, the client portal, auth cookies). Business-decision
 * placeholders (registered entity, governing jurisdiction, retention
 * windows) are filled with reasonable defaults — see LEGAL_ASSUMPTIONS in
 * this file for what to confirm or change before treating this as final,
 * and have qualified counsel review it before that.
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
const LAST_UPDATED = "Effective September 24, 2026";

/**
 * LEGAL_ASSUMPTIONS — defaults filled in below that reflect a business
 * decision rather than the product's actual behavior. Confirm or change
 * these (and get qualified counsel to review the page) before relying on
 * it as binding: legal entity "Binx, Inc." with no confirmed state of
 * formation or address; governing law/venue set to Delaware as a common
 * default for a US SaaS company; minimum account age set to 18; workspace
 * data retention set to 30 days after account deletion, then removed from
 * backups within 90 days; data hosted on AWS in the US (us-east-2).
 */

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
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

            <h2>Overview</h2>
            <p>
              This policy explains what information {SITE.name} (&quot;{SITE.name}&quot;, &quot;we&quot;,
              &quot;us&quot;) collects when an agency and its team use the product, when that agency&apos;s clients
              use the client portal, and when someone simply visits this marketing site. It applies to Binx, Inc.,
              the company behind {SITE.name}.
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

            <h2>AI features</h2>
            <p>
              {SITE.name}&apos;s AI features — lead scoring, the daily dashboard briefing, drafted project summaries
              and invoice reminders, and the &quot;Ask AI&quot; assistant that answers questions about an
              agency&apos;s own leads, clients, projects, and invoices — are powered by Anthropic&apos;s Claude
              models. Requests sent to Anthropic are limited to what&apos;s needed to answer the specific question
              asked, are not used to train Anthropic&apos;s models under our agreement with them, and every account
              can see and manage how much AI usage its team is spending.
            </p>
            <p>
              The AI lead prospector works differently: when an agency enables it and describes the kind of client
              it&apos;s looking for, that search criteria is sent to Google Places to find matching real businesses,
              and the results are given to Claude to turn into a ranked shortlist. Google Places only receives the
              search criteria an agency enters (for example, an industry and a location) — never an agency&apos;s own
              client, project, or invoice data. This lookup only happens when a workspace has connected a Google
              Places API key; it&apos;s off by default.
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
                <strong>Anthropic</strong> — powers the AI dashboard briefing, drafting, lead scoring, and the
                &quot;Ask AI&quot; assistant.
              </li>
              <li>
                <strong>Google Places</strong> — powers the AI lead prospector, and only receives the search criteria
                a workspace enters, when that workspace has enabled it.
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
              delete their account from Account settings, which removes their profile information. Workspace and
              agency data is retained for 30 days after an account or agency is deleted, in case deletion needs to be
              reversed, and is then permanently removed, including from backups, within 90 days.
            </p>

            <h2>Your rights</h2>
            <p>
              Depending on where you&apos;re located, you may have rights to access, correct, export, or delete your
              personal information, and to object to or restrict certain processing — including rights under the
              GDPR (EU/UK) and the CCPA/CPRA (California). Most of this you can already do directly from Account and
              Profile settings — for anything else, contact us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>,
              and we&apos;ll respond within the time your local law requires.
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
              {SITE.name} is hosted on Amazon Web Services in the United States (us-east-2). If you access{" "}
              {SITE.name} from outside the United States, your information will be transferred to and processed in
              the United States, which may have different data protection laws than your country. Where required, we
              rely on standard contractual clauses or equivalent safeguards with our service providers for these
              transfers.
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
