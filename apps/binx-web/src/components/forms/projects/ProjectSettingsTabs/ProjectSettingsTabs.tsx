/**
 * ProjectSettingsTabs.tsx
 *
 * Sub-navigation for the project Settings page. The page has four unrelated
 * concerns — the project's details, its member roles, its task tags, and the
 * delete danger zone — that used to stack into one long scroll. This splits
 * them into a left-hand nav (a horizontal strip on narrow screens) with one
 * panel visible at a time.
 *
 * The active panel is mirrored to the URL hash (`#roles`, `#tags`, …) so it
 * survives a refresh and can be linked to directly; it falls back to
 * "details" for an unknown or absent hash.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectSettingsTabs/ProjectSettingsTabs.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState } from "react";

import type { AgencyClient } from "@/lib/clients";
import type { Project, ProjectRole, ProjectTag } from "@/lib/projects";
import ProjectForm from "@/components/forms/projects/ProjectForm/ProjectForm";
import ProjectLabelsPanel from "@/components/forms/projects/ProjectLabelsPanel/ProjectLabelsPanel";
import DeleteProjectForm from "@/components/forms/projects/DeleteProjectForm/DeleteProjectForm";

import styles from "./ProjectSettingsTabs.module.scss";

interface ProjectSettingsTabsProps {
  agencyId: string;
  project: Project;
  clients: AgencyClient[];
  roles: ProjectRole[];
  tags: ProjectTag[];
}

type SectionId = "details" | "roles" | "tags" | "danger";

const SECTIONS: { id: SectionId; label: string; danger?: boolean }[] = [
  { id: "details", label: "Details" },
  { id: "roles", label: "Member roles" },
  { id: "tags", label: "Task tags" },
  { id: "danger", label: "Danger zone", danger: true },
];

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

const ProjectSettingsTabs = ({ agencyId, project, clients, roles, tags }: ProjectSettingsTabsProps) => {
  const [active, setActive] = useState<SectionId>("details");

  // Read the initial section from the URL hash on mount, and keep in step if
  // the user navigates hash history (back/forward).
  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.replace("#", "");
      if (isSectionId(fromHash)) setActive(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const select = (id: SectionId) => {
    setActive(id);
    // replaceState, not a real navigation — no scroll jump, no history spam.
    window.history.replaceState(null, "", id === "details" ? window.location.pathname : `#${id}`);
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={styles.navItem}
            data-active={active === section.id}
            data-danger={section.danger}
            aria-current={active === section.id ? "page" : undefined}
            onClick={() => select(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className={styles.panel}>
        {active === "details" && (
          <section>
            <h2 className={styles.sectionTitle}>Details</h2>
            <p className={styles.sectionSubtitle}>Update this project&apos;s name, client, status, and timeline.</p>
            <ProjectForm agencyId={agencyId} clients={clients} project={project} />
          </section>
        )}

        {active === "roles" && (
          <section>
            <h2 className={styles.sectionTitle}>Member roles</h2>
            <p className={styles.sectionSubtitle}>
              Custom labels for what people do on this project — e.g. &ldquo;Project Manager&rdquo; or &ldquo;Web
              Developer&rdquo;. Assign them to people on the Team tab.
            </p>
            <ProjectLabelsPanel agencyId={agencyId} projectId={project.id} kind="role" labels={roles} />
          </section>
        )}

        {active === "tags" && (
          <section>
            <h2 className={styles.sectionTitle}>Task tags</h2>
            <p className={styles.sectionSubtitle}>
              Custom labels for categorising tasks — e.g. &ldquo;Bug&rdquo;, &ldquo;Design&rdquo;, or
              &ldquo;Urgent&rdquo;. Apply them to tasks from the task panel.
            </p>
            <ProjectLabelsPanel agencyId={agencyId} projectId={project.id} kind="tag" labels={tags} />
          </section>
        )}

        {active === "danger" && (
          <section className={styles.dangerZone}>
            <h2 className={styles.dangerZoneTitle}>Danger zone</h2>
            <p className={styles.sectionSubtitle}>
              Permanently delete {project.name} and everything in it — its board, files, and team assignments. This
              can&apos;t be undone.
            </p>
            <DeleteProjectForm agencyId={agencyId} projectId={project.id} projectName={project.name} />
          </section>
        )}
      </div>
    </div>
  );
};

export default ProjectSettingsTabs;
