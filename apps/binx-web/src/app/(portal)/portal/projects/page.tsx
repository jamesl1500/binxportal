/**
 * page.tsx - Portal Projects
 *
 * Every project the agency is running for this client, as filterable cards
 * with progress and due dates (see PortalProjectList).
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getPortalContext, getPortalProjects } from "@/lib/portal";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";
import PortalProjectList from "@/components/portal/PortalProjectList/PortalProjectList";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Projects" };

const PortalProjectsPage = async () => {
  const [context, projects] = await Promise.all([getPortalContext(), getPortalProjects()]);
  const active = projects.filter((project) => project.status === "active").length;
  const agencyName = context?.agency.name ?? "your agency";

  return (
    <div className={styles.page}>
      <PortalPageHeader
        eyebrow="Projects"
        title="Your projects"
        subtitle={
          projects.length === 0
            ? `Projects ${agencyName} runs for you will show up here.`
            : `${active} in progress · ${projects.length} in total. Open one for its timeline, task board and shared canvas.`
        }
      />

      {projects.length === 0 ? (
        <p className={styles.empty}>No projects yet.</p>
      ) : (
        <PortalProjectList projects={projects} />
      )}
    </div>
  );
};

export default PortalProjectsPage;
