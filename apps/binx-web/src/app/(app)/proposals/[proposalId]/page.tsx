/**
 * page.tsx - Proposal Detail
 *
 * A single proposal: the status-aware action bar, the read view, and — while
 * it's a draft — the documents panel for attaching files. Once sent, the
 * read view lists the documents instead. A bad :proposalId 404s.
 *
 * @module apps/binx-web/src/app/(app)/proposals/[proposalId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getProposal, getProposalEvents } from "@/lib/proposals";
import ProposalActions from "@/components/proposals/ProposalActions/ProposalActions";
import ProposalAttachmentsManager from "@/components/proposals/ProposalAttachmentsManager/ProposalAttachmentsManager";
import ProposalAuditTrail from "@/components/proposals/ProposalAuditTrail/ProposalAuditTrail";
import CountersignPanel from "@/components/proposals/CountersignPanel/CountersignPanel";
import ProposalView from "@/components/proposals/ProposalView/ProposalView";

import styles from "../page.module.scss";

interface ProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export async function generateMetadata({
  params,
}: ProposalPageProps): Promise<Metadata> {
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

      {proposal.display_status === "awaiting_countersign" && (
        <CountersignPanel
          agencyId={currentAgency.id}
          proposalId={proposal.id}
          clientName={
            proposal.signature?.signer_name ??
            proposal.recipient_name ??
            "The client"
          }
          consentText={proposal.consent_text}
          documentHash={proposal.document_hash}
          canSign={
            currentAgency.role === "owner" || currentAgency.role === "admin"
          }
          signerName={(await getCurrentUser())?.full_name ?? "you"}
        />
      )}

      {proposal.status === "draft" ? (
        <>
          <ProposalView proposal={proposal} />
          <ProposalAttachmentsManager
            agencyId={currentAgency.id}
            proposalId={proposal.id}
            attachments={proposal.attachments}
          />
        </>
      ) : (
        <ProposalView
          proposal={proposal}
          attachmentHrefBase={`/api/proposals/${currentAgency.id}/${proposal.id}/attachments`}
          certificateHref={
            proposal.status === "signed"
              ? `/proposals/${proposal.id}/certificate`
              : undefined
          }
        />
      )}

      {proposal.status !== "draft" && (
        <ProposalAuditTrail
          events={await getProposalEvents(currentAgency.id, proposal.id)}
          documentHash={proposal.document_hash}
        />
      )}
    </div>
  );
};

export default ProposalPage;
