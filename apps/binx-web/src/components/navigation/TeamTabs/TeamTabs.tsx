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

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import PageCoachmark from "@/components/tutorial/PageCoachmark/PageCoachmark";

import styles from "./TeamTabs.module.scss";

interface TeamTabsProps {
  canManage: boolean;
}

const TeamTabs = ({ canManage }: TeamTabsProps) => {
  const pathname = usePathname();
  const invitationsRef = useRef<HTMLAnchorElement | null>(null);

  const tabs = [
    { href: "/team", label: "Members" },
    ...(canManage ? [{ href: "/team/invitations", label: "Invitations" }] : []),
  ];

  return (
    <nav className={styles.tabs} aria-label="Team">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          ref={tab.href === "/team/invitations" ? invitationsRef : undefined}
          className={styles.tab}
          data-active={pathname === tab.href}
        >
          {tab.label}
        </Link>
      ))}

      {canManage && (
        <PageCoachmark
          id="team-invitations"
          anchorRef={invitationsRef}
          title="Bring your team in"
          body="Invite teammates here — they'll get an email invite and can start working right away."
        />
      )}
    </nav>
  );
};

export default TeamTabs;
