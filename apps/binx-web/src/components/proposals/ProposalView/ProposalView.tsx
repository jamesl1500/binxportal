/**
 * ProposalView.tsx
 *
 * The read layout for a proposal: title, status, recipient info, the
 * line-item table, totals, the content block, and — once decided —
 * signature details or a decline reason.
 *
 * @module apps/binx-web/src/components/proposals/ProposalView/ProposalView.tsx
 * @author Binx.io
 */
"use client";

import type { ProposalDetail } from "@/lib/proposals";
import { proposalStatusLabel } from "@/lib/proposals-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./ProposalView.module.scss";

interface ProposalViewProps {
  proposal: ProposalDetail;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function quantityLabel(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isInteger(n) ? String(n) : quantity;
}

const ProposalView = ({ proposal }: ProposalViewProps) => {
  const currency = proposal.currency;

  return (
    <article className={styles.proposal}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{proposal.title}</h1>
          <span className={styles.status} data-status={proposal.display_status}>
            {proposalStatusLabel(proposal.display_status)}
          </span>
        </div>
        <dl className={styles.meta}>
          {proposal.client_name && (
            <div>
              <dt>Client</dt>
              <dd>{proposal.client_name}</dd>
            </div>
          )}
          {proposal.lead_name && (
            <div>
              <dt>Lead</dt>
              <dd>{proposal.lead_name}</dd>
            </div>
          )}
          {proposal.valid_until && (
            <div>
              <dt>Valid until</dt>
              <dd>{formatDate(proposal.valid_until)}</dd>
            </div>
          )}
          {proposal.sent_at && (
            <div>
              <dt>Sent</dt>
              <dd>{formatDate(proposal.sent_at)}</dd>
            </div>
          )}
        </dl>
      </header>

      <section>
        <h2 className={styles.sectionLabel}>Recipient</h2>
        <p className={styles.partyName}>{proposal.recipient_name ?? "—"}</p>
        {proposal.recipient_email && <p className={styles.partyLine}>{proposal.recipient_email}</p>}
      </section>

      {proposal.content && (
        <section>
          <h2 className={styles.sectionLabel}>Proposal</h2>
          <p className={styles.content}>{proposal.content}</p>
        </section>
      )}

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
            {proposal.line_items.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.noLines}>
                  No line items yet.
                </td>
              </tr>
            )}
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
        <section className={styles.decision}>
          <h2 className={styles.sectionLabel}>Signature</h2>
          <p className={styles.partyName}>
            {proposal.signature.signer_name} · {proposal.signature.signer_email}
          </p>
          <p className={styles.partyLine}>Signed {formatDate(proposal.signature.signed_at)}</p>
        </section>
      )}

      {proposal.status === "declined" && (
        <section className={styles.decision}>
          <h2 className={styles.sectionLabel}>Decline reason</h2>
          <p className={styles.content}>{proposal.decline_reason ?? "No reason was given."}</p>
          {proposal.decided_at && <p className={styles.partyLine}>Declined {formatDate(proposal.decided_at)}</p>}
        </section>
      )}
    </article>
  );
};

export default ProposalView;
