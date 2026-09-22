/**
 * page.tsx - Portal Proposal Detail
 *
 * One proposal, using the same read layout staff see, plus a sign/decline
 * control while it's still awaiting a decision. A bad :proposalId, a draft,
 * or a proposal for another client 404s (binx-api scopes/filters this).
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/[proposalId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalProposal } from "@/lib/portal";
import PortalProposalActions from "@/components/proposals/PortalProposalActions/PortalProposalActions";
import ProposalView from "@/components/proposals/ProposalView/ProposalView";

import styles from "../page.module.scss";

interface PortalProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export async function generateMetadata({ params }: PortalProposalPageProps): Promise<Metadata> {
  const { proposalId } = await params;
  try {
    const proposal = await getPortalProposal(proposalId);
    return { title: proposal.title };
  } catch {
    return { title: "Proposal" };
  }
}

const PortalProposalDetailPage = async ({ params }: PortalProposalPageProps) => {
  const { proposalId } = await params;

  let proposal;
  try {
    proposal = await getPortalProposal(proposalId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const awaitingDecision = proposal.display_status === "sent" || proposal.display_status === "viewed";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/portal/proposals" className={styles.link}>
          ← All proposals
        </Link>
      </header>

      <ProposalView proposal={proposal} />

      {awaitingDecision && <PortalProposalActions proposalId={proposal.id} />}
    </div>
  );
};

export default PortalProposalDetailPage;
