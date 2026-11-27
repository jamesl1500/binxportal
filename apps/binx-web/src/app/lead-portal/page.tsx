/**
 * Lead Portal Page
 *
 * `/lead-portal?token=...`: the branded page an agency shares with a lead
 * before they're a client. The agency's logo and colour, a welcome note,
 * the proposals they've been sent (each opening its own review-and-sign
 * page), and a question thread with the team. Once they've signed and been
 * set up as a client, it points them to their client portal.
 *
 * No session: the token alone scopes it, like a proposal's share link.
 *
 * @module apps/binx-web/src/app/lead-portal/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getPublicLeadPortal } from "@/lib/lead-portal";
import { formatMoneyCents } from "@/lib/money";
import { proposalPriceLabel, proposalStatusLabel } from "@/lib/proposals-client";
import LeadPortalQuestionForm from "@/components/leads/LeadPortalQuestionForm/LeadPortalQuestionForm";

import styles from "./page.module.scss";

export const metadata: Metadata = {
  title: "Your proposal",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

const ACTION_LABELS: Record<string, string> = {
  sent: "Review & sign",
  viewed: "Review & sign",
  awaiting_countersign: "View",
  signed: "View",
  declined: "View",
  expired: "View",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** "#0a0a0b"-style colours only, so nothing else reaches the style attribute. */
function safeColor(color: string | null): string | undefined {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
}

const LeadPortalPage = async ({ searchParams }: PageProps) => {
  const { token } = await searchParams;
  let portal: Awaited<ReturnType<typeof getPublicLeadPortal>> | null = null;
  if (token) {
    portal = await getPublicLeadPortal(token).catch(() => null);
  }

  if (!token || !portal) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This page isn&apos;t available</h1>
          <p className={styles.muted}>
            The link may have been reset or turned off. Ask the agency that sent
            it for a new one.
          </p>
        </div>
      </div>
    );
  }

  const brand = safeColor(portal.brand_color);
  const greeting = portal.contact_name ? `Hi ${portal.contact_name.split(" ")[0]},` : `Hi ${portal.lead_name},`;

  return (
    <div className={styles.page} style={brand ? ({ "--brand": brand } as React.CSSProperties) : undefined}>
      <div className={styles.shell}>
        <header className={styles.header}>
          {portal.has_logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a proxied, per-agency logo
            <img
              className={styles.logo}
              src={`/api/lead-portal/${encodeURIComponent(token)}/logo`}
              alt={portal.agency_name}
            />
          ) : (
            <span className={styles.agency}>{portal.agency_name}</span>
          )}
        </header>

        {portal.is_client && (
          <section className={styles.clientBanner}>
            <h2>You&apos;re all set</h2>
            <p>
              You&apos;re now a client of {portal.agency_name}. Your projects,
              invoices and messages live in your client portal; check your email
              for the invitation if you haven&apos;t joined yet.
            </p>
            <a className={styles.primary} href={portal.portal_login_url}>
              Go to your client portal
            </a>
          </section>
        )}

        <section className={styles.card}>
          <span className={styles.eyebrow}>For {portal.lead_name}</span>
          <h1 className={styles.title}>{greeting}</h1>
          <p className={styles.welcome}>
            {portal.welcome_message ??
              `Here's everything from ${portal.agency_name} in one place. Ask us anything below.`}
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Proposals</h2>
          {portal.proposals.length === 0 ? (
            <p className={styles.muted}>Your proposal will appear here once it&apos;s ready.</p>
          ) : (
            <ul className={styles.proposals}>
              {portal.proposals.map((proposal) => (
                <li key={proposal.url} className={styles.proposal}>
                  <div>
                    <p className={styles.proposalTitle}>{proposal.title}</p>
                    <p className={styles.muted}>
                      {proposal.total_cents === null
                        ? "Price on the proposal"
                        : proposalPriceLabel(
                            {
                              total_cents: proposal.total_cents,
                              monthly_total_cents: proposal.monthly_total_cents ?? 0,
                            },
                            (cents) => formatMoneyCents(cents, proposal.currency),
                          )}
                      {proposal.valid_until ? ` · valid until ${formatDate(proposal.valid_until)}` : ""}
                    </p>
                  </div>
                  <span className={styles.status} data-status={proposal.display_status}>
                    {proposalStatusLabel(proposal.display_status)}
                  </span>
                  <a className={styles.primary} href={proposal.url}>
                    {ACTION_LABELS[proposal.display_status] ?? "View"}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Questions</h2>
          {portal.messages.length > 0 && (
            <ol className={styles.thread}>
              {portal.messages.map((message) => (
                <li key={message.id} className={styles.message} data-author={message.author_kind}>
                  <p className={styles.messageMeta}>
                    {message.author_kind === "agency"
                      ? `${message.author_name}, ${portal.agency_name}`
                      : message.author_name}
                  </p>
                  <p className={styles.messageBody}>{message.body}</p>
                </li>
              ))}
            </ol>
          )}
          <LeadPortalQuestionForm token={token} defaultName={portal.contact_name} />
        </section>

        <footer className={styles.footer}>Powered by Binx</footer>
      </div>
    </div>
  );
};

export default LeadPortalPage;
