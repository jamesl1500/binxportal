/**
 * page.tsx - Proposal templates
 *
 * The agency's saved starting points for proposals: use one to start a new
 * proposal prefilled, edit it, or build a new one.
 *
 * @module apps/binx-web/src/app/(app)/proposals/templates/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getProposalTemplates } from "@/lib/proposal-templates";
import ProposalTemplatesList from "@/components/proposals/ProposalTemplatesList/ProposalTemplatesList";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Proposal templates" };

const ProposalTemplatesPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const templates = await getProposalTemplates(currentAgency.id);

  return (
    <div>
      <Link href="/proposals" className={styles.backLink}>
        ← All proposals
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Proposals</span>
          <h1 className={styles.title}>Templates</h1>
          <p className={styles.subtitle}>
            Start proposals from your usual scope, prices, packages and
            documents, then tailor them for each client.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/proposals/templates/new" className={styles.newButton}>
            <Plus aria-hidden="true" />
            New template
          </Link>
        </div>
      </div>

      <ProposalTemplatesList agencyId={currentAgency.id} templates={templates} />
    </div>
  );
};

export default ProposalTemplatesPage;
