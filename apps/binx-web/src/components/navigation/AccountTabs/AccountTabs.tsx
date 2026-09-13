/**
 * AccountTabs.tsx
 *
 * Sub-nav for the account-settings area: Preferences (notifications, privacy)
 * and Security (email, password, activity, account deletion). Highlights the
 * active tab via `usePathname`, the same pattern SettingsTabs / TeamTabs /
 * ProjectTabs / ClientTabs use.
 *
 * @module apps/binx-web/src/components/navigation/AccountTabs/AccountTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./AccountTabs.module.scss";

const TABS = [
  { href: "/account", label: "Preferences" },
  { href: "/account/security", label: "Security" },
];

const AccountTabs = () => {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Account settings">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};

export default AccountTabs;
