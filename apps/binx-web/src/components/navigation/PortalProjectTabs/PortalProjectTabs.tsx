/**
 * PortalProjectTabs.tsx
 *
 * Sub-nav for a client-portal project's pages: the read-only overview
 * (progress, timeline), the read-only task board, and the shared
 * collaboration canvas. Mirrors staff's ProjectTabs — same active-tab
 * pattern via `usePathname` — but trimmed to what a client should see (no
 * Team/Files/Settings).
 *
 * @module apps/binx-web/src/components/navigation/PortalProjectTabs/PortalProjectTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./PortalProjectTabs.module.scss";

interface PortalProjectTabsProps {
  projectId: string;
}

const PortalProjectTabs = ({ projectId }: PortalProjectTabsProps) => {
  const pathname = usePathname();
  const base = `/portal/projects/${projectId}`;

  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/canvas`, label: "Canvas" },
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

export default PortalProjectTabs;
