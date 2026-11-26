/**
 * page.tsx - Proposal Signing Certificate (staff)
 *
 * The signing certificate for a signed proposal: the document as sent, the
 * signature evidence and the audit trail. An unsigned proposal goes back to
 * its detail page; a bad :proposalId 404s.
 *
 * @module apps/binx-web/src/app/(app)/proposals/[proposalId]/certificate/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getProposalCertificate } from "@/lib/proposals";
import SigningCertificate from "@/components/proposals/SigningCertificate/SigningCertificate";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Signing certificate" };

interface PageProps {
  params: Promise<{ proposalId: string }>;
}

const ProposalCertificatePage = async ({ params }: PageProps) => {
  const { proposalId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let certificate;
  try {
    certificate = await getProposalCertificate(currentAgency.id, proposalId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) notFound();
    if (error instanceof AuthApiError && error.status === 409) {
      redirect(`/proposals/${proposalId}`);
    }
    throw error;
  }

  return (
    <div>
      <Link href={`/proposals/${proposalId}`} className={styles.backLink}>
        ← Back to {certificate.title}
      </Link>
      <SigningCertificate
        certificate={certificate}
        pdfHref={`/api/proposals/${currentAgency.id}/${proposalId}/certificate`}
      />
    </div>
  );
};

export default ProposalCertificatePage;
