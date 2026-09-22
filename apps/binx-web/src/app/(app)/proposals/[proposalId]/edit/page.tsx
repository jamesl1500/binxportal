/**
 * page.tsx - Edit Proposal
 *
 * The draft editor for an existing proposal. Only drafts are editable — a
 * sent/viewed/signed/declined/expired proposal redirects back to its detail
 * page.
 *
 * @module apps/binx-web/src/app/(app)/proposals/[proposalId]/edit/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getProposal } from "@/lib/proposals";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Edit proposal" };

interface EditProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

const EditProposalPage = async ({ params }: EditProposalPageProps) => {
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

  if (proposal.status !== "draft") {
    redirect(`/proposals/${proposalId}`);
  }

  const clients = await getAgencyClients(currentAgency.id);

  return (
    <div>
      <Link href={`/proposals/${proposalId}`} className={styles.backLink}>
        ← Back to {proposal.title}
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposals</span>
          <h1 className={styles.title}>Edit {proposal.title}</h1>
        </div>
      </div>

      <div className={styles.formCard}>
        <ProposalForm
          agencyId={currentAgency.id}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          proposal={proposal}
        />
      </div>
    </div>
  );
};

export default EditProposalPage;
