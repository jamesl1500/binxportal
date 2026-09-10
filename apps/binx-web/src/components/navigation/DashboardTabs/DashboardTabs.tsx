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

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className={styles.tabs} aria-label="Dashboard">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
          {tab.href === "/dashboard/my-work" && myWorkCount > 0 && (
            <span className={styles.badge}>{myWorkCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
};

export default DashboardTabs;
