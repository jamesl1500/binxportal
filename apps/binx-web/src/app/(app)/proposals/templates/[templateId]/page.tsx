/**
 * page.tsx - Proposal template
 *
 * One template: edit what it holds (the proposal editor in template mode),
 * manage its documents, or start a proposal from it.
 *
 * @module apps/binx-web/src/app/(app)/proposals/templates/[templateId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { AuthApiError } from "@/lib/auth";
import { getKickoffTemplates } from "@/lib/kickoffs";
import { getProposalTemplate } from "@/lib/proposal-templates";
import { getServices } from "@/lib/services";
import ProposalAttachmentsManager from "@/components/proposals/ProposalAttachmentsManager/ProposalAttachmentsManager";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "Proposal template" };

interface ProposalTemplatePageProps {
  params: Promise<{ templateId: string }>;
}

const ProposalTemplatePage = async ({ params }: ProposalTemplatePageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const { templateId } = await params;

  let template;
  try {
    template = await getProposalTemplate(currentAgency.id, templateId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) notFound();
    throw error;
  }
  const [services, kickoffTemplates] = await Promise.all([
    getServices(currentAgency.id),
    getKickoffTemplates(currentAgency.id),
  ]);

  return (
    <div>
      <Link href="/proposals/templates" className={styles.backLink}>
        ← All templates
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposal template</span>
          <h1 className={styles.title}>{template.name}</h1>
          {template.description && <p className={styles.subtitle}>{template.description}</p>}
        </div>
        <div className={styles.actions}>
          <Link href={`/proposals/new?template=${template.id}`} className={styles.newButton}>
            Use this template
          </Link>
        </div>
      </div>
      <div className={styles.formCard}>
        <ProposalForm
          key={template.updated_at ?? template.id}
          agencyId={currentAgency.id}
          clients={[]}
          services={services}
          kickoffTemplates={kickoffTemplates.map((t) => ({ id: t.id, name: t.name }))}
          templateEditor={{
            id: template.id,
            name: template.name,
            description: template.description ?? "",
            data: template.data,
          }}
        />
      </div>
      <div className={styles.formCard}>
        <ProposalAttachmentsManager
          agencyId={currentAgency.id}
          templateId={template.id}
          attachments={template.attachments}
        />
      </div>
    </div>
  );
};

export default ProposalTemplatePage;
