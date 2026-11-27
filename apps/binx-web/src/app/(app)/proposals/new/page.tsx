/**
 * page.tsx - New Proposal
 *
 * Draft-proposal editor. binx-api assigns the share token on creation.
 * `?lead=` starts it for a lead (from the lead's page), and `?client=` for a
 * client; signing it then sets that lead up as a client. `?template=` starts
 * it from a saved template (prefilled; its documents are copied on create),
 * and the page offers the agency's templates to start from.
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
import { getProposalTemplate, getProposalTemplates } from "@/lib/proposal-templates";
import { getServices } from "@/lib/services";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New proposal" };

interface NewProposalPageProps {
  searchParams: Promise<{ client?: string; lead?: string; template?: string }>;
}

const NewProposalPage = async ({ searchParams }: NewProposalPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [
    { client, lead: leadId, template: templateId },
    clients,
    services,
    kickoffTemplates,
    templates,
  ] = await Promise.all([
    searchParams,
    getAgencyClients(currentAgency.id),
    getServices(currentAgency.id),
    getKickoffTemplates(currentAgency.id),
    getProposalTemplates(currentAgency.id),
  ]);
  const [lead, template] = await Promise.all([
    leadId ? getLead(currentAgency.id, leadId).catch(() => null) : null,
    templateId
      ? getProposalTemplate(currentAgency.id, templateId).catch(() => null)
      : null,
  ]);
  // Picking a template keeps who the proposal is for.
  const templateHref = (id: string) => {
    const query = new URLSearchParams({ template: id });
    if (leadId) query.set("lead", leadId);
    if (client) query.set("client", client);
    return `/proposals/new?${query}`;
  };

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

      {!template && templates.length > 0 && (
        <nav className={styles.templatePicker} aria-label="Start from a template">
          <span className={styles.templatePickerLabel}>Start from a template</span>
          {templates.slice(0, 8).map((item) => (
            <Link key={item.id} href={templateHref(item.id)} className={styles.templateChip}>
              {item.name}
            </Link>
          ))}
          <Link href="/proposals/templates" className={styles.templateManage}>
            Manage templates
          </Link>
        </nav>
      )}

      <div className={styles.formCard}>
        <ProposalForm
          key={template?.id ?? "blank"}
          agencyId={currentAgency.id}
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            primaryContactName: c.primary_contact_name,
            primaryContactEmail: c.primary_contact_email,
          }))}
          initialClientId={client ?? null}
          fromTemplate={
            template
              ? {
                  id: template.id,
                  name: template.name,
                  data: template.data,
                  attachmentCount: template.attachments.length,
                }
              : null
          }
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
