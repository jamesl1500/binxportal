/**
 * ProjectsTable.tsx
 *
 * The agency's project roster: searchable by name/client, filterable by
 * lifecycle status, linking each row to its dashboard. Search and the status
 * filter are both client-side, same reasoning as ClientsTable — the list
 * page already fetches every project once.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectsTable/ProjectsTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PROJECT_STATUS_LABELS as STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/lib/projects-client";
import type { Project } from "@/lib/projects";

import styles from "./ProjectsTable.module.scss";

type StatusFilter = ProjectStatus | "all";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ProjectsTableProps {
  projects: Project[];
}

const ProjectsTable = ({ projects }: ProjectsTableProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const countsByStatus = useMemo(() => {
    const counts = new Map<ProjectStatus, number>();
    for (const project of projects) {
      counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (!query) return true;
      return project.name.toLowerCase().includes(query) || project.client_name.toLowerCase().includes(query);
    });
  }, [projects, search, statusFilter]);

  if (projects.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>No projects yet</p>
        <p className={styles.emptyText}>Create your first project to start tracking delivery work for a client.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filter by status">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "all"}
            className={styles.tab}
            onClick={() => setStatusFilter("all")}
          >
            All <span className={styles.tabCount}>{projects.length}</span>
          </button>
          {PROJECT_STATUSES.map((statusOption) => (
            <button
              key={statusOption}
              type="button"
              role="tab"
              aria-selected={statusFilter === statusOption}
              className={styles.tab}
              onClick={() => setStatusFilter(statusOption)}
            >
              {STATUS_LABELS[statusOption]} <span className={styles.tabCount}>{countsByStatus.get(statusOption) ?? 0}</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          className={styles.search}
          placeholder="Search projects…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search projects"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No matching projects</p>
          <p className={styles.emptyText}>Try a different search or filter.</p>
        </div>
      ) : (
        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headCell}>Project</th>
              <th className={styles.headCell}>Client</th>
              <th className={styles.headCell}>Status</th>
              <th className={styles.headCell}>Timeline</th>
              <th className={styles.headCell}>Team</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr key={project.id} className={styles.row}>
                <td className={styles.cell}>
                  <Link href={`/projects/${project.id}`} className={styles.projectLink}>
                    <p className={styles.name}>{project.name}</p>
                    {project.description && <span className={styles.description}>{project.description}</span>}
                  </Link>
                </td>
                <td className={styles.cell}>{project.client_name}</td>
                <td className={styles.cell}>
                  <span className={styles.statusBadge} data-status={project.status}>
                    {STATUS_LABELS[project.status]}
                  </span>
                </td>
                <td className={`${styles.cell} ${styles.timeline}`}>
                  {project.start_date || project.due_date ? (
                    <>
                      {project.start_date ? formatDate(project.start_date) : "—"}
                      {" → "}
                      {project.due_date ? formatDate(project.due_date) : "—"}
                    </>
                  ) : (
                    <span className={styles.noDates}>No dates set</span>
                  )}
                </td>
                <td className={styles.cell}>
                  {project.member_count} {project.member_count === 1 ? "member" : "members"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

export default ProjectsTable;
