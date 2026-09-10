/**
 * ProjectTabs.tsx
 *
 * Sub-nav for a project's pages: the dashboard overview, its dedicated kanban
 * board, the team roster, the file library, and settings. Highlights the
 * active tab via `usePathname`, the same pattern AppHeader's primary nav uses.
 * Project message threads live on the main /messages page now.
 *
 * @module apps/binx-web/src/components/navigation/ProjectTabs/ProjectTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./ProjectTabs.module.scss";

interface ProjectTabsProps {
  projectId: string;
}

const ProjectTabs = ({ projectId }: ProjectTabsProps) => {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { href: base, label: "Dashboard" },
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/canvas`, label: "Canvas" },
    { href: `${base}/team`, label: "Team" },
    { href: `${base}/files`, label: "Files" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className={styles.tabs} aria-label="Project">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};

export default ProjectTabs;
