/**
 * page.tsx - Portal Proposals
 *
 * The client's proposals (drafts are never shown — binx-api filters them),
 * split into what's waiting on their decision — highlighted, with a direct
 * "Review & sign" — and everything already decided.
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileSignature } from "lucide-react";

import { formatMoneyCents } from "@/lib/money";
import { getPortalProposals, type PortalProposal } from "@/lib/portal";
import { formatDay, isAwaitingDecision } from "@/lib/portal-insights";
import { proposalStatusLabel } from "@/lib/proposals-client";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Proposals" };

const ProposalRow = ({ proposal }: { proposal: PortalProposal }) => (
  <li>
    <Link href={`/portal/proposals/${proposal.id}`} className={styles.row}>
      <span className={styles.icon} aria-hidden="true">
        <FileSignature />
      </span>
      <span className={styles.main}>
        <span className={styles.title}>{proposal.title}</span>
        <span className={styles.meta}>
          Sent {formatDay(proposal.sent_at ?? proposal.created_at)}
          {proposal.valid_until && ` · valid until ${formatDay(proposal.valid_until)}`}
        </span>
      </span>
      <span className={styles.status} data-status={proposal.display_status}>
        {proposalStatusLabel(proposal.display_status)}
      </span>
      <span className={styles.amount}>{formatMoneyCents(proposal.total_cents, proposal.currency)}</span>
      <ChevronRight className={styles.chevron} aria-hidden="true" />
    </Link>
  </li>
);

const PortalProposalsPage = async () => {
  const proposals = await getPortalProposals();
  const awaiting = proposals.filter(isAwaitingDecision);
  const decided = proposals.filter((proposal) => !isAwaitingDecision(proposal));

  return (
    <div className={styles.page}>
      <PortalPageHeader
        eyebrow="Agreements"
        title="Proposals"
        subtitle={
          awaiting.length > 0
            ? `${awaiting.length} awaiting your decision — review the scope and sign in one click.`
            : proposals.length > 0
              ? `${proposals.length} ${proposals.length === 1 ? "proposal" : "proposals"}, all decided.`
              : "Proposals sent to you for review and signature will show up here."
        }
      />

      {proposals.length === 0 ? (
        <p className={styles.empty}>No proposals yet.</p>
      ) : (
        <>
          {awaiting.length > 0 && (
            <section className={styles.section} aria-labelledby="awaiting-title">
              <h2 id="awaiting-title" className={styles.sectionTitle}>
                Awaiting your decision
              </h2>
              <ul className={styles.list} data-highlight="true">
                {awaiting.map((proposal) => (
                  <ProposalRow key={proposal.id} proposal={proposal} />
                ))}
              </ul>
            </section>
          )}
          {decided.length > 0 && (
            <section className={styles.section} aria-labelledby="history-title">
              <h2 id="history-title" className={styles.sectionTitle}>
                {awaiting.length > 0 ? "History" : "All proposals"}
              </h2>
              <ul className={styles.list}>
                {decided.map((proposal) => (
                  <ProposalRow key={proposal.id} proposal={proposal} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PortalProposalsPage;
