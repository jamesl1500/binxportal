/**
 * page.tsx - New Proposal
 *
 * Draft-proposal editor. binx-api assigns the share token on creation.
 *
 * @module apps/binx-web/src/app/(app)/proposals/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New proposal" };

interface NewProposalPageProps {
  searchParams: Promise<{ client?: string }>;
}

const NewProposalPage = async ({ searchParams }: NewProposalPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { client } = await searchParams;

  return (
    <div>
      <Link href="/proposals" className={styles.backLink}>
        ← All proposals
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposals</span>
          <h1 className={styles.title}>New proposal</h1>
          <p className={styles.subtitle}>Draft it here — you can review before sending.</p>
        </div>
      </div>

      <div className={styles.formCard}>
        <ProposalForm agencyId={currentAgency.id} initialClientId={client ?? null} />
      </div>
    </div>
  );
};

export default NewProposalPage;
