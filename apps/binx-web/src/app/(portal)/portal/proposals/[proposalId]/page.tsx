/**
 * page.tsx - Portal Proposal Detail
 *
 * One proposal, using the same read layout staff see, plus a sign/decline
 * control while it's still awaiting a decision. A bad :proposalId, a draft,
 * or a proposal for another client 404s (binx-api scopes/filters this).
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/[proposalId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalContext, getPortalProposal } from "@/lib/portal";
import PortalProposalActions from "@/components/proposals/PortalProposalActions/PortalProposalActions";
import DepositPanel from "@/components/proposals/DepositPanel/DepositPanel";
import ProposalView from "@/components/proposals/ProposalView/ProposalView";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import styles from "../page.module.scss";

interface PortalProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export async function generateMetadata({
  params,
}: PortalProposalPageProps): Promise<Metadata> {
  const { proposalId } = await params;
  try {
    const proposal = await getPortalProposal(proposalId);
    return { title: proposal.title };
  } catch {
    return { title: "Proposal" };
  }
}

const PortalProposalDetailPage = async ({
  params,
}: PortalProposalPageProps) => {
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

  const agencyName = (await getPortalContext())?.agency.name ?? "Your agency";
  const awaitingDecision =
    proposal.display_status === "sent" || proposal.display_status === "viewed";

  return (
    <div className={styles.page}>
      <PortalPageHeader
        back={{ href: "/portal/proposals", label: "All proposals" }}
        eyebrow="Proposal"
        title={proposal.title}
        subtitle={
          awaitingDecision
            ? "Read it through, then sign or decline at the bottom."
            : undefined
        }
      />

      <ProposalView
        proposal={proposal}
        attachmentHrefBase={`/api/portal/proposals/${proposal.id}/attachments`}
        certificateHref={
          proposal.status === "signed"
            ? `/portal/proposals/${proposal.id}/certificate`
            : undefined
        }
        choose={awaitingDecision ? { proposalId: proposal.id } : undefined}
      />

      {proposal.deposit && (
        <DepositPanel
          deposit={proposal.deposit}
          agencyName={agencyName}
          invoiceHref={
            proposal.deposit.invoice_id
              ? `/portal/invoices/${proposal.deposit.invoice_id}`
              : undefined
          }
        />
      )}

      {awaitingDecision && (
        <PortalProposalActions
          proposalId={proposal.id}
          consentText={proposal.consent_text}
          documentHash={proposal.document_hash}
        />
      )}
    </div>
  );
};

export default PortalProposalDetailPage;
