/**
 * Public Signing Certificate Page
 *
 * `/proposals/public/certificate?token=...`: the signing certificate for a
 * signed proposal, reached from the share link once it's signed. No session,
 * the token alone scopes it (same as the proposal page itself).
 *
 * @module apps/binx-web/src/app/proposals/public/certificate/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getPublicCertificate } from "@/lib/proposals";
import { ProposalCodeRequired } from "@/lib/proposal-access";
import ProposalCodeGate from "@/components/proposals/ProposalCodeGate/ProposalCodeGate";
import SigningCertificate from "@/components/proposals/SigningCertificate/SigningCertificate";

import styles from "../page.module.scss";

export const metadata: Metadata = {
  title: "Signing certificate",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

const PublicCertificatePage = async ({ searchParams }: PageProps) => {
  const { token } = await searchParams;

  let certificate: Awaited<ReturnType<typeof getPublicCertificate>> | null =
    null;
  let error = "This certificate link is missing its token.";
  let gate: ProposalCodeRequired | null = null;
  if (token) {
    try {
      certificate = await getPublicCertificate(token);
    } catch (caught) {
      if (caught instanceof ProposalCodeRequired) gate = caught;
      error =
        caught instanceof Error
          ? caught.message
          : "This signing certificate isn't available.";
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
            what="this signed record"
          />
        </div>
      </div>
    );
  }

  if (!token || !certificate) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>Signing certificate</span>
          <h1 className={styles.title}>Not available</h1>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.certificateWrap}>
        <Link
          href={`/proposals/public?token=${encodeURIComponent(token)}`}
          className={styles.backLink}
        >
          ← Back to the proposal
        </Link>
        <SigningCertificate
          certificate={certificate}
          pdfHref={`/api/proposals/public/${encodeURIComponent(token)}/certificate`}
        />
      </div>
    </div>
  );
};

export default PublicCertificatePage;
