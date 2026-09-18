/**
 * SettingsTabs.tsx
 *
 * Sub-nav for the agency settings area. The tabs are grouped — identity
 * (Profile, Policies), operations (Invoicing, Meetings, Plan, AI), and
 * General — with a hairline between groups so the tabs read as three
 * clusters rather than one long row. Active tab is matched on `usePathname`,
 * the same pattern ProjectTabs / ClientTabs use.
 *
 * @module apps/binx-web/src/components/navigation/SettingsTabs/SettingsTabs.tsx
 * @author Binx.io
 */
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./SettingsTabs.module.scss";

const TAB_GROUPS: { href: string; label: string }[][] = [
  [
    { href: "/settings", label: "Profile" },
    { href: "/settings/policies", label: "Policies" },
  ],
  [
    { href: "/settings/invoicing", label: "Invoicing" },
    { href: "/settings/meetings", label: "Meetings" },
    { href: "/settings/plan", label: "Plan" },
    { href: "/settings/ai", label: "AI" },
  ],
  [{ href: "/settings/general", label: "General" }],
];

const SettingsTabs = () => {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Agency settings">
      {TAB_GROUPS.map((group, index) => (
        <Fragment key={group[0].href}>
          {index > 0 && <span className={styles.groupDivider} aria-hidden="true" />}
          {group.map((tab) => (
            <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
              {tab.label}
            </Link>
          ))}
        </Fragment>
      ))}
    </nav>
  );
};

export default SettingsTabs;
