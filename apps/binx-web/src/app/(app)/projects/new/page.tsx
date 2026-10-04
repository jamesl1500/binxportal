/**
 * page.tsx - New Project
 *
 * Dedicated create page for a project: a multi-step wizard (details → task
 * tags → member roles → team → review, see NewProjectForm) so every project
 * starts set up for the team, then the AI starter-task offer before landing
 * on the project's own page.
 *
 * @module apps/binx-web/src/app/(app)/projects/new/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getCurrentUser } from "@/lib/auth";
import { getAgencyClients } from "@/lib/clients";
import NewProjectForm from "@/components/forms/projects/NewProjectForm/NewProjectForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "New project" };

interface NewProjectPageProps {
  searchParams: Promise<{ clientId?: string }>;
}

const NewProjectPage = async ({ searchParams }: NewProjectPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [{ clientId }, clients, agencyMembers, user] = await Promise.all([
    searchParams,
    getAgencyClients(currentAgency.id),
    getAgencyMembers(currentAgency.id),
    getCurrentUser(),
  ]);
  if (!user) {
    redirect("/auth/login");
  }

  // Only honor a clientId that's actually this agency's — an unknown or
  // cross-agency id falls back to the form's own default selection.
  const preselectedClient = clients.find((client) => client.id === clientId);

  return (
    <div>
      <Link
        href={preselectedClient ? `/clients/${preselectedClient.id}` : "/projects"}
        className={styles.backLink}
      >
        ← {preselectedClient ? preselectedClient.name : "All projects"}
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Projects</span>
          <h1 className={styles.title}>New project</h1>
          <p className={styles.subtitle}>
            {preselectedClient
              ? `Setting up a project for ${preselectedClient.name}. Add the task tags, roles, and team in a few quick steps.`
              : "Set up the details, task tags, roles, and team in a few quick steps, so it's ready to work in from day one."}
          </p>
        </div>
      </div>

      {clients.length === 0 ? (
        <p className={styles.notice}>
          You&apos;ll need a client before you can start a project — add one
          from the Clients page first.
        </p>
      ) : (
        <div className={styles.formCard}>
          <NewProjectForm
            agencyId={currentAgency.id}
            clients={clients}
            agencyMembers={agencyMembers}
            currentUserId={user.id}
            initialClientId={preselectedClient?.id}
          />
        </div>
      )}
    </div>
  );
};

export default NewProjectPage;
