/**
 * page.tsx - Portal Signing Certificate
 *
 * The signing certificate for one of the client's signed proposals. 404 for
 * someone else's proposal; an unsigned one goes back to the proposal.
 *
 * @module apps/binx-web/src/app/(portal)/portal/proposals/[proposalId]/certificate/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalProposalCertificate } from "@/lib/portal";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";
import SigningCertificate from "@/components/proposals/SigningCertificate/SigningCertificate";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Signing certificate" };

interface PageProps {
  params: Promise<{ proposalId: string }>;
}

const PortalCertificatePage = async ({ params }: PageProps) => {
  const { proposalId } = await params;

  let certificate;
  try {
    certificate = await getPortalProposalCertificate(proposalId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) notFound();
    if (error instanceof AuthApiError && error.status === 409) {
      redirect(`/portal/proposals/${proposalId}`);
    }
    throw error;
  }

  return (
    <div className={styles.page}>
      <PortalPageHeader
        back={{ href: `/portal/proposals/${proposalId}`, label: "Back to the proposal" }}
        eyebrow="Proposal"
        title="Signing certificate"
        subtitle="Your record of what you signed, when and how. Print it or save it as a PDF to keep a copy."
      />
      <SigningCertificate
        certificate={certificate}
        pdfHref={`/api/portal/proposals/${proposalId}/certificate`}
      />
    </div>
  );
};

export default PortalCertificatePage;
