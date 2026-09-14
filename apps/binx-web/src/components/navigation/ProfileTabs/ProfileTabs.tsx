/**
 * ProfileTabs.tsx
 *
 * Sub-nav for the profile area: Details (name/title/phone/bio), Skills &
 * Experience, Photos (avatar/cover), and Appearance (accent color).
 * Highlights the active tab via `usePathname`, the same pattern
 * AccountTabs / TeamTabs / ProjectTabs / ClientTabs use.
 *
 * @module apps/binx-web/src/components/navigation/ProfileTabs/ProfileTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./ProfileTabs.module.scss";

const TABS = [
  { href: "/profile", label: "Details" },
  { href: "/profile/qualifications", label: "Skills & Experience" },
  { href: "/profile/photos", label: "Photos" },
  { href: "/profile/appearance", label: "Appearance" },
];

const ProfileTabs = () => {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Profile">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};

export default ProfileTabs;
