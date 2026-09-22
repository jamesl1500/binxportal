/**
 * page.tsx - Client Proposals
 *
 * A client's proposal history — the same table as the agency-wide
 * `/proposals` page, scoped to this client. "New proposal" pre-fills the
 * client.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/proposals/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import { getProposals } from "@/lib/proposals";
import ProposalsTable from "@/components/proposals/ProposalsTable/ProposalsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Proposals" };

interface ClientProposalsPageProps {
  params: Promise<{ clientId: string }>;
}

const ClientProposalsPage = async ({ params }: ClientProposalsPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [client, proposals] = await Promise.all([
    getAgencyClient(currentAgency.id, clientId),
    getProposals(currentAgency.id, { clientId }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Proposals</h2>
          <p className={styles.subtitle}>Proposals sent to {client.name}.</p>
        </div>
        <Link href={`/proposals/new?client=${client.id}`} className={styles.newButton}>
          <Plus aria-hidden="true" />
          New proposal
        </Link>
      </div>

      <ProposalsTable proposals={proposals} showClient={false} />
    </div>
  );
};

export default ClientProposalsPage;
