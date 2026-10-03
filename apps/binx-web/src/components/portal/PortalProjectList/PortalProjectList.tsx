/**
 * PortalProjectList.tsx
 *
 * The Projects page's card grid with a segmented filter — All / In progress
 * / Completed — so a client with a long history can find the live work
 * fast. Filtering is local; the list is small and already on the page.
 *
 * @module apps/binx-web/src/components/portal/PortalProjectList/PortalProjectList.tsx
 * @author Binx Portal
 */
"use client";

import { useState } from "react";

import type { PortalProject } from "@/lib/portal";
import PortalProjectCard from "@/components/portal/PortalProjectCard/PortalProjectCard";
import SegmentedFilter from "@/components/portal/SegmentedFilter/SegmentedFilter";

import styles from "./PortalProjectList.module.scss";

type Filter = "all" | "open" | "completed";

const isOpen = (project: PortalProject) =>
  project.status !== "completed" && project.status !== "archived";

const PortalProjectList = ({ projects }: { projects: PortalProject[] }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const now = new Date();

  const counts = {
    all: projects.length,
    open: projects.filter(isOpen).length,
    completed: projects.length - projects.filter(isOpen).length,
  };
  const visible = projects.filter((project) =>
    filter === "all"
      ? true
      : filter === "open"
        ? isOpen(project)
        : !isOpen(project),
  );

  return (
    <div className={styles.wrap}>
      <SegmentedFilter<Filter>
        label="Filter projects"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "open", label: "In progress", count: counts.open },
          { value: "completed", label: "Completed", count: counts.completed },
        ]}
      />

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {filter === "completed"
            ? "Nothing's wrapped up yet."
            : "No projects in progress right now."}
        </p>
      ) : (
        <ul className={styles.grid}>
          {visible.map((project) => (
            <li key={project.id}>
              <PortalProjectCard project={project} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PortalProjectList;
