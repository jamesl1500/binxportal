/**
 * page.tsx - New proposal template
 *
 * The proposal editor in template mode, starting empty. Documents can be
 * added once it's saved (the page moves on to the template's own page).
 *
 * @module apps/binx-web/src/app/(app)/proposals/templates/new/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getKickoffTemplates } from "@/lib/kickoffs";
import { getServices } from "@/lib/services";
import ProposalForm from "@/components/proposals/ProposalForm/ProposalForm";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "New proposal template" };

const NewProposalTemplatePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
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
          <span className={styles.eyebrow}>Proposal templates</span>
          <h1 className={styles.title}>New template</h1>
          <p className={styles.subtitle}>
            Everything a proposal holds except who it&apos;s for. Add
            documents after you save it.
          </p>
        </div>
      </div>
      <div className={styles.formCard}>
        <ProposalForm
          agencyId={currentAgency.id}
          clients={[]}
          services={services}
          kickoffTemplates={kickoffTemplates.map((t) => ({ id: t.id, name: t.name }))}
          templateEditor={{ name: "", description: "" }}
        />
      </div>
    </div>
  );
};

export default NewProposalTemplatePage;
