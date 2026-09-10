/**
 * page.tsx - Client Projects
 *
 * Every project this agency runs for the client, in the same searchable /
 * status-filterable table the main Projects list uses. Filtered from the
 * agency's full project list client-side — same "fetch the list once" pattern
 * as everywhere else.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/projects/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import { getAgencyProjects } from "@/lib/projects";
import ProjectsTable from "@/components/forms/projects/ProjectsTable/ProjectsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Projects" };

interface ClientProjectsPageProps {
  params: Promise<{ clientId: string }>;
}

const ClientProjectsPage = async ({ params }: ClientProjectsPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [client, allProjects] = await Promise.all([
    getAgencyClient(currentAgency.id, clientId),
    getAgencyProjects(currentAgency.id),
  ]);

  const projects = allProjects.filter((project) => project.client_id === clientId);

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Projects</h2>
          <p className={styles.subtitle}>
            {projects.length === 0
              ? `No projects yet for ${client.name}.`
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"} for ${client.name}.`}
          </p>
        </div>
        <Link href="/projects" className={styles.newLink}>
          New project
        </Link>
      </div>

      <ProjectsTable projects={projects} />
    </div>
  );
};

export default ClientProjectsPage;
