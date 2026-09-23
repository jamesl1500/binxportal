/**
 * page.tsx - New Project
 *
 * Dedicated create page for a project: the fields, then — once created —
 * the same AI starter-task offer the old CreateProjectDialog showed before
 * landing on the project's own page.
 *
 * @module apps/binx-web/src/app/(app)/projects/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import NewProjectForm from "@/components/forms/projects/NewProjectForm/NewProjectForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New project" };

const NewProjectPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const clients = await getAgencyClients(currentAgency.id);

  return (
    <div>
      <Link href="/projects" className={styles.backLink}>
        ← All projects
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Projects</span>
          <h1 className={styles.title}>New project</h1>
          <p className={styles.subtitle}>
            Every project starts with a To Do, In Progress, and Done list — you can add more once it&apos;s created.
          </p>
        </div>
      </div>

      {clients.length === 0 ? (
        <p className={styles.notice}>
          You&apos;ll need a client before you can start a project — add one from the Clients page first.
        </p>
      ) : (
        <div className={styles.formCard}>
          <NewProjectForm agencyId={currentAgency.id} clients={clients} />
        </div>
      )}
    </div>
  );
};

export default NewProjectPage;
