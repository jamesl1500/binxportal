/**
 * page.tsx - Proposals
 *
 * The agency-wide proposal list: a status-filterable table and a
 * "New proposal" button. The (app) layout already guards for a signed-in
 * session with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/proposals/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getProposals } from "@/lib/proposals";
import ProposalsTable from "@/components/proposals/ProposalsTable/ProposalsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Proposals" };

const ProposalsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const proposals = await getProposals(currentAgency.id);
  const draftCount = proposals.filter((proposal) => proposal.status === "draft").length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposals</span>
          <h1 className={styles.title}>Proposals</h1>
          <p className={styles.subtitle}>
            {proposals.length} total · {draftCount} draft{draftCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className={styles.actions}>
          <Link href="/proposals/new" className={styles.newButton}>
            <Plus aria-hidden="true" />
            New proposal
          </Link>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <ProposalsTable proposals={proposals} />
      </div>
    </div>
  );
};

export default ProposalsPage;
