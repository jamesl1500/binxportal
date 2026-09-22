/**
 * page.tsx - Proposal Detail
 *
 * A single proposal: the status-aware action bar and the read view. A bad
 * :proposalId 404s.
 *
 * @module apps/binx-web/src/app/(app)/proposals/[proposalId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getProposal } from "@/lib/proposals";
import ProposalActions from "@/components/proposals/ProposalActions/ProposalActions";
import ProposalView from "@/components/proposals/ProposalView/ProposalView";

import styles from "../page.module.scss";

interface ProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export async function generateMetadata({ params }: ProposalPageProps): Promise<Metadata> {
  const { proposalId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return { title: "Proposal" };
    const proposal = await getProposal(currentAgency.id, proposalId);
    return { title: proposal.title };
  } catch {
    return { title: "Proposal" };
  }
}

const ProposalPage = async ({ params }: ProposalPageProps) => {
  const { proposalId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let proposal;
  try {
    proposal = await getProposal(currentAgency.id, proposalId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <Link href="/proposals" className={styles.backLink}>
        ← All proposals
      </Link>

      <ProposalActions agencyId={currentAgency.id} proposal={proposal} />

      <ProposalView proposal={proposal} />
    </div>
  );
};

export default ProposalPage;
