/**
 * AppHeader.tsx
 *
 * Top navigation bar for the authenticated app area: an org switcher for
 * which agency the user is currently working in, primary nav links, a
 * "Manage" dropdown for secondary destinations, and an account dropdown
 * (profile / sign out). Dropdowns are built on Base UI's headless Menu
 * primitives (see components/ui/button.tsx for the same library used
 * elsewhere), styled to match this app's token-driven design system.
 *
 * @module apps/binx-web/src/components/navigation/AppHeader/AppHeader.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";

import { logoutAction } from "@/app/(app)/actions";
import BinxMark from "@/components/BinxMark/BinxMark";
import type { CurrentUser } from "@/lib/auth";
import type { AgencyRead } from "@/lib/agencies";
import type { AppNotification } from "@/lib/notifications";
import OrgSwitcher from "@/components/navigation/OrgSwitcher/OrgSwitcher";
import NotificationBell from "@/components/notifications/NotificationBell/NotificationBell";
import AiAssistantLauncher from "@/components/ai/AiAssistantLauncher/AiAssistantLauncher";

import styles from "./AppHeader.module.scss";

interface AppHeaderProps {
  user: CurrentUser;
  agencies: AgencyRead[];
  currentAgency: AgencyRead;
  /** Unread messages across the current agency's conversations — badges the Messages link. */
  unreadMessages?: number;
  /** Unread in-app notifications for the signed-in user — badges the bell. */
  unreadNotifications?: number;
  /** The most recent notifications, to seed the dropdown before its first poll. */
  notifications?: AppNotification[];
}

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/messages", label: "Messages" },
];

const MANAGE_LINKS: NavLink[] = [
  { href: "/team", label: "Team" },
  { href: "/invoices", label: "Invoices" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

const AppHeader = ({
  user,
  agencies,
  currentAgency,
  unreadMessages = 0,
  unreadNotifications = 0,
  notifications = [],
}: AppHeaderProps) => {
  const pathname = usePathname();
  const [isSigningOut, startTransition] = useTransition();

  const initial = user.full_name.trim().charAt(0).toUpperCase() || "?";

  const handleSignOut = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.workspace}>
          <Link href="/dashboard" className={styles.brand}>
            <BinxMark className={styles.brandMark} />
            Binx
          </Link>

          <span className={styles.divider} aria-hidden="true" />

          <OrgSwitcher agencies={agencies} currentAgency={currentAgency} />
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.navLink}
              data-active={pathname === link.href || pathname.startsWith(`${link.href}/`)}
            >
              {link.label}
              {link.href === "/messages" && unreadMessages > 0 && (
                <span className={styles.navBadge}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>
              )}
            </Link>
          ))}

          <Menu.Root>
            <Menu.Trigger className={styles.navTrigger}>
              Manage
              <ChevronDown className={styles.chevron} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className={styles.positioner} sideOffset={8} align="start">
                <Menu.Popup className={styles.popup}>
                  {MANAGE_LINKS.map((link) => (
                    <Menu.LinkItem
                      key={link.href}
                      render={<Link href={link.href} />}
                      className={styles.menuItem}
                      closeOnClick
                    >
                      {link.label}
                    </Menu.LinkItem>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </nav>
      </div>

      <div className={styles.right}>
        <AiAssistantLauncher agencyId={currentAgency.id} />
        <NotificationBell initialUnreadCount={unreadNotifications} initialItems={notifications} />

        <Menu.Root>
          <Menu.Trigger className={styles.accountTrigger} aria-label={`${user.full_name} account menu`}>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.userName} aria-hidden="true">
              {user.full_name}
            </span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={styles.positioner} sideOffset={8} align="end">
              <Menu.Popup className={styles.popup}>
                <Menu.Group>
                  <Menu.GroupLabel className={styles.groupLabel}>{user.email}</Menu.GroupLabel>
                  <Menu.LinkItem render={<Link href="/profile" />} className={styles.menuItem} closeOnClick>
                    Profile
                  </Menu.LinkItem>
                  <Menu.LinkItem render={<Link href="/account" />} className={styles.menuItem} closeOnClick>
                    Account settings
                  </Menu.LinkItem>
                  <Menu.LinkItem render={<Link href="/settings" />} className={styles.menuItem} closeOnClick>
                    Agency settings
                  </Menu.LinkItem>
                </Menu.Group>
                <Menu.Item
                  className={`${styles.menuItem} ${styles.signOut}`}
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </header>
  );
};

export default AppHeader;
