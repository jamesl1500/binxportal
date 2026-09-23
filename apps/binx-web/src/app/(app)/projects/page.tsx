/**
 * page.tsx - Projects
 *
 * The current agency's project roster: a searchable, status-filterable
 * table plus a "New project" link to the dedicated `/projects/new` page.
 * The (app) layout above this page already guards for a signed-in session
 * with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/projects/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getAgencyProjects } from "@/lib/projects";
import ProjectsTable from "@/components/forms/projects/ProjectsTable/ProjectsTable";
import NewProjectButton from "@/components/forms/projects/NewProjectButton/NewProjectButton";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Projects" };

const ProjectsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [projects, clients] = await Promise.all([
    getAgencyProjects(currentAgency.id),
    getAgencyClients(currentAgency.id),
  ]);
  const activeCount = projects.filter((project) => project.status === "active").length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Projects</span>
          <h1 className={styles.title}>Your projects</h1>
          <p className={styles.subtitle}>
            {activeCount} active {activeCount === 1 ? "project" : "projects"} at {currentAgency.name}.
          </p>
        </div>

        <NewProjectButton />
      </div>

      {clients.length === 0 && (
        <p className={styles.notice}>
          You&apos;ll need a client before you can start a project — add one from the Clients page first.
        </p>
      )}

      <div className={styles.tableWrapper}>
        <ProjectsTable projects={projects} />
      </div>
    </div>
  );
};

export default ProjectsPage;
