/**
 * DashboardTabs.tsx
 *
 * Sub-nav for the dashboard: the at-a-glance Overview, the signed-in
 * member's My Work, and Pulse (charts). Highlights the active tab via
 * `usePathname`, the same pattern SettingsTabs / TeamTabs use.
 *
 * @module apps/binx-web/src/components/navigation/DashboardTabs/DashboardTabs.tsx
 * @author Binx.io
 */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./DashboardTabs.module.scss";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/my-work", label: "My work" },
  { href: "/dashboard/pulse", label: "Pulse" },
];

interface DashboardTabsProps {
  /** Badge on the My work tab — the member's open task count. */
  myWorkCount?: number;
}

const DashboardTabs = ({ myWorkCount = 0 }: DashboardTabsProps) => {
  const pathname = usePathname();
  const myWorkRef = useRef<HTMLAnchorElement | null>(null);

  return (
    <nav className={styles.tabs} aria-label="Dashboard">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          ref={tab.href === "/dashboard/my-work" ? myWorkRef : undefined}
          className={styles.tab}
          data-active={pathname === tab.href}
        >
          {tab.label}
          {tab.href === "/dashboard/my-work" && myWorkCount > 0 && (
            <span className={styles.badge}>{myWorkCount}</span>
          )}
        </Link>
      ))}

      <PageCoachmark
        id="dashboard-my-work"
        anchorRef={myWorkRef}
        title="Your personal view"
        body="Check My work for what's assigned to you specifically, across every project."
      />
    </nav>
  );
};

export default DashboardTabs;
