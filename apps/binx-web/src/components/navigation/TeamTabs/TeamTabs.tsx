/**
 * TeamTabs.tsx
 *
 * Sub-nav for the team area: the member roster, and — for owners/admins —
 * outstanding invitations. Highlights the active tab via `usePathname`, the
 * same pattern SettingsTabs / ProjectTabs / ClientTabs use. The Invitations
 * tab is only rendered when `canManage` is true; the page it points at also
 * redirects non-admins, so this is presentation only.
 *
 * @module apps/binx-web/src/components/navigation/TeamTabs/TeamTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./TeamTabs.module.scss";

interface TeamTabsProps {
  canManage: boolean;
}

const TeamTabs = ({ canManage }: TeamTabsProps) => {
  const pathname = usePathname();

  const tabs = [
    { href: "/team", label: "Members" },
    ...(canManage ? [{ href: "/team/invitations", label: "Invitations" }] : []),
  ];

  return (
    <nav className={styles.tabs} aria-label="Team">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};

export default TeamTabs;
