/**
 * Public Proposal Page
 *
 * The unauthenticated, token-scoped page a proposal's recipient opens from
 * their share link: `/proposals/public?token=...`. Renders the proposal
 * read-only (each line's details and any attached documents included), plus
 * a sign/decline form while it's still awaiting a decision. Documents
 * download through `/api/proposals/public/{token}/attachments/{id}`.
 * Not under `(app)` or `(auth)` — it needs no session at all, the opaque
 * token alone scopes the request (see `lib/proposals.ts#getPublicProposal`).
 *
 * @module apps/binx-web/src/app/proposals/public/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getPublicProposal } from "@/lib/proposals";
import { ProposalCodeRequired } from "@/lib/proposal-access";
import { PER_MONTH, proposalStatusLabel, proposalTotalRows } from "@/lib/proposals-client";
import { formatMoneyCents } from "@/lib/money";
import ProposalAttachmentList from "@/components/proposals/ProposalAttachmentList/ProposalAttachmentList";
import ProposalCodeGate from "@/components/proposals/ProposalCodeGate/ProposalCodeGate";
import ProposalLines from "@/components/proposals/ProposalLines/ProposalLines";
import PublicProposalActions from "@/components/proposals/PublicProposalActions/PublicProposalActions";

import styles from "./page.module.scss";

export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false },
};

interface PublicProposalPageProps {
  searchParams: Promise<{ token?: string }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const PublicProposalPage = async ({
  searchParams,
}: PublicProposalPageProps) => {
  const { token } = await searchParams;

  let proposal: Awaited<ReturnType<typeof getPublicProposal>> | null = null;
  let tokenError: string | null = null;
  let gate: ProposalCodeRequired | null = null;

  if (!token) {
    tokenError = "This proposal link is missing its token.";
  } else {
    try {
      proposal = await getPublicProposal(token);
    } catch (error) {
      if (error instanceof ProposalCodeRequired) gate = error;
      tokenError =
        error instanceof Error
          ? error.message
          : "This proposal link is invalid or has expired.";
    }
  }

  if (token && gate) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <ProposalCodeGate
            token={token}
            agencyName={gate.agencyName}
            title={gate.title}
            emailHint={gate.emailHint}
          />
        </div>
      </div>
    );
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
  const awaitingDecision =
    proposal.display_status === "sent" || proposal.display_status === "viewed";

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

        {proposal.recipient_name && (
          <p className={styles.subtitle}>
            Prepared for {proposal.recipient_name}
          </p>
        )}
        {proposal.valid_until && (
          <p className={styles.subtitle}>
            Valid until {formatDate(proposal.valid_until)}
          </p>
        )}

        {proposal.content && (
          <p className={styles.content}>{proposal.content}</p>
        )}

        <ProposalLines
          currency={currency}
          lineItems={proposal.line_items}
          packages={proposal.packages}
          choose={awaitingDecision ? { token } : undefined}
        />

        <dl className={styles.totals}>
          {proposalTotalRows(proposal).map((row) => (
            <div key={`${row.label}-${row.perMonth}`} className={row.grand ? styles.grandTotal : undefined}>
              <dt>{row.label}</dt>
              <dd>
                {formatMoneyCents(row.cents, currency)}
                {row.perMonth ? PER_MONTH : ""}
              </dd>
            </div>
          ))}
        </dl>

        {proposal.attachments.length > 0 && (
          <section className={styles.documents}>
            <h2 className={styles.documentsTitle}>Documents</h2>
            <ProposalAttachmentList
              attachments={proposal.attachments}
              hrefBase={`/api/proposals/public/${encodeURIComponent(token)}/attachments`}
            />
          </section>
        )}

        {proposal.signature && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>
              Signed by {proposal.signature.signer_name}
            </p>
            <p className={styles.decisionLine}>
              {proposal.signature.signer_email} ·{" "}
              {formatDate(proposal.signature.signed_at)}
            </p>
            {proposal.countersignature ? (
              <p className={styles.decisionLine}>
                Countersigned by {proposal.countersignature.signer_name} for{" "}
                {proposal.agency_name} ·{" "}
                {formatDate(proposal.countersignature.signed_at)}
              </p>
            ) : (
              proposal.requires_countersign && (
                <p className={styles.decisionLine}>
                  {proposal.agency_name} will countersign next. You&apos;ll
                  get the signed PDF by email once they have.
                </p>
              )
            )}
          </div>
        )}

        {proposal.status === "signed" && (
          <Link
            href={`/proposals/public/certificate?token=${encodeURIComponent(token)}`}
            className={styles.certificateLink}
          >
            View the signing certificate →
          </Link>
        )}

        {proposal.status === "declined" && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>This proposal was declined.</p>
          </div>
        )}

        {proposal.display_status === "expired" && (
          <div className={styles.decision}>
            <p className={styles.decisionTitle}>This proposal has expired.</p>
            <p className={styles.decisionLine}>
              Ask {proposal.agency_name} to resend it.
            </p>
          </div>
        )}

        {awaitingDecision && (
          <div className={styles.actions}>
            <PublicProposalActions
              token={token}
              recipientName={proposal.recipient_name}
              consentText={proposal.consent_text}
              documentHash={proposal.document_hash}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicProposalPage;
