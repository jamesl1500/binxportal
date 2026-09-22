/**
 * page.tsx - Portal Proposals
 *
 * The client's proposals (drafts are never shown — binx-api filters them).
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getPortalProposals } from "@/lib/portal";
import { proposalStatusLabel } from "@/lib/proposals-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Proposals" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const PortalProposalsPage = async () => {
  const proposals = await getPortalProposals();
  const awaitingDecision = proposals.filter(
    (proposal) => proposal.display_status === "sent" || proposal.display_status === "viewed",
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Proposals</span>
        <h1 className={styles.title}>Proposals</h1>
        <p className={styles.subtitle}>
          {awaitingDecision > 0
            ? `${awaitingDecision} awaiting your decision.`
            : `${proposals.length} ${proposals.length === 1 ? "proposal" : "proposals"}.`}
        </p>
      </header>

      {proposals.length === 0 ? (
        <p className={styles.empty}>No proposals yet.</p>
      ) : (
        <ul className={styles.proposalList}>
          {proposals.map((proposal) => (
            <li key={proposal.id}>
              <Link href={`/portal/proposals/${proposal.id}`} className={styles.proposalRow}>
                <span className={styles.proposalTitle}>{proposal.title}</span>
                <span className={styles.proposalStatus} data-status={proposal.display_status}>
                  {proposalStatusLabel(proposal.display_status)}
                </span>
                <span className={styles.proposalAmount}>
                  {formatMoneyCents(proposal.total_cents, proposal.currency)} · {formatDate(proposal.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PortalProposalsPage;
