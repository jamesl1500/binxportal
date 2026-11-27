/**
 * page.tsx - New Proposal
 *
 * Draft-proposal editor. binx-api assigns the share token on creation.
 * `?lead=` starts it for a lead (from the lead's page), and `?client=` for a
 * client; signing it then sets that lead up as a client.
 *
 * @module apps/binx-web/src/app/(app)/proposals/new/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getKickoffTemplates } from "@/lib/kickoffs";
import { getLead } from "@/lib/leads";
import { getServices } from "@/lib/services";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New proposal" };

interface NewProposalPageProps {
  searchParams: Promise<{ client?: string; lead?: string }>;
}

const NewProposalPage = async ({ searchParams }: NewProposalPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [{ client, lead: leadId }, clients, services, kickoffTemplates] =
    await Promise.all([
      searchParams,
      getAgencyClients(currentAgency.id),
      getServices(currentAgency.id),
      getKickoffTemplates(currentAgency.id),
    ]);
  const lead = leadId
    ? await getLead(currentAgency.id, leadId).catch(() => null)
    : null;

  return (
    <div>
      <Link href="/proposals" className={styles.backLink}>
        ← All proposals
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposals</span>
          <h1 className={styles.title}>New proposal</h1>
          <p className={styles.subtitle}>
            Draft it here. You can attach documents and review it before
            sending.
          </p>
        </div>
      </div>

      <div className={styles.formCard}>
        <ProposalForm
          agencyId={currentAgency.id}
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            primaryContactName: c.primary_contact_name,
            primaryContactEmail: c.primary_contact_email,
          }))}
          initialClientId={client ?? null}
          services={services}
          kickoffTemplates={kickoffTemplates.map((t) => ({
            id: t.id,
            name: t.name,
          }))}
          lead={
            lead
              ? {
                  id: lead.id,
                  name: lead.name,
                  contactName: lead.contact_name,
                  contactEmail: lead.contact_email,
                }
              : null
          }
        />
      </div>
    </div>
  );
};

export default NewProposalPage;
