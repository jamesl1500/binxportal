/**
 * Public Proposal Page
 *
 * The unauthenticated, token-scoped page a proposal's recipient opens from
 * their share link: `/proposals/public?token=...`. Renders the proposal
 * read-only, plus a sign/decline form while it's still awaiting a decision.
 * Not under `(app)` or `(auth)` — it needs no session at all, the opaque
 * token alone scopes the request (see `lib/proposals.ts#getPublicProposal`).
 *
 * @module apps/binx-web/src/app/proposals/public/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getPublicProposal } from "@/lib/proposals";
import { proposalStatusLabel } from "@/lib/proposals-client";
import { formatMoneyCents } from "@/lib/money";
import PublicProposalActions from "@/components/proposals/PublicProposalActions/PublicProposalActions";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

interface PublicProposalPageProps {
  searchParams: Promise<{ token?: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function quantityLabel(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isInteger(n) ? String(n) : quantity;
}

const PublicProposalPage = async ({ searchParams }: PublicProposalPageProps) => {
  const { token } = await searchParams;

  let proposal: Awaited<ReturnType<typeof getPublicProposal>> | null = null;
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This proposal link is missing its token.";
  } else {
    try {
      proposal = await getPublicProposal(token);
    } catch (error) {
      tokenError = error instanceof Error ? error.message : "This proposal link is invalid or has expired.";
    }
  }

  if (!token || !proposal) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>Proposal</span>
          <h1 className={styles.title}>Link unavailable</h1>
          <p className={styles.error}>{tokenError}</p>
        </div>
      </div>
    );
  }

  const currency = proposal.currency;
  const awaitingDecision = proposal.display_status === "sent" || proposal.display_status === "viewed";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>{proposal.agency_name}</span>
        <header className={styles.header}>
          <h1 className={styles.title}>{proposal.title}</h1>
          <span className={styles.status} data-status={proposal.display_status}>
            {proposalStatusLabel(proposal.display_status)}
          </span>
        </header>

        {proposal.recipient_name && <p className={styles.subtitle}>Prepared for {proposal.recipient_name}</p>}
        {proposal.valid_until && (
          <p className={styles.subtitle}>Valid until {formatDate(proposal.valid_until)}</p>
        )}

        {proposal.content && <p className={styles.content}>{proposal.content}</p>}

        <div className={styles.tableScroll}>
          <table className={styles.lineTable}>
            <thead>
              <tr>
                <th>Description</th>
                <th className={styles.numCol}>Qty</th>
                <th className={styles.numCol}>Unit price</th>
                <th className={styles.numCol}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {proposal.line_items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className={styles.numCol}>{quantityLabel(item.quantity)}</td>
                  <td className={styles.numCol}>{formatMoneyCents(item.unit_price_cents, currency)}</td>
                  <td className={styles.numCol}>{formatMoneyCents(item.amount_cents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoneyCents(proposal.subtotal_cents, currency)}</dd>
          </div>
          {proposal.tax_cents > 0 && (
            <div>
              <dt>Tax ({Number.parseFloat(proposal.tax_rate_percent)}%)</dt>
              <dd>{formatMoneyCents(proposal.tax_cents, currency)}</dd>
            </div>
          )}
          <div className={styles.grandTotal}>
            <dt>Total</dt>
            <dd>{formatMoneyCents(proposal.total_cents, currency)}</dd>
          </div>
        </dl>

        {proposal.signature && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>Signed by {proposal.signature.signer_name}</p>
            <p className={styles.decisionLine}>
              {proposal.signature.signer_email} · {formatDate(proposal.signature.signed_at)}
            </p>
          </div>
        )}

        {proposal.status === "declined" && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>This proposal was declined.</p>
          </div>
        )}

        {proposal.display_status === "expired" && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>This proposal has expired.</p>
            <p className={styles.decisionLine}>Ask {proposal.agency_name} to resend it.</p>
          </div>
        )}

        {awaitingDecision && (
          <div className={styles.actions}>
            <PublicProposalActions token={token} recipientName={proposal.recipient_name} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProposalPage;
