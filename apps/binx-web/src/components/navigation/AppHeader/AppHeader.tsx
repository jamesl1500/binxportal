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
 * Hover matches the marketing header (components/marketing/MarketingHeader):
 * a highlight pill slides between the nav links as the pointer or keyboard
 * focus moves across them, and settles back on the current page's link —
 * or on "Manage" when the current page lives in that menu. The motion is
 * CSS; under `prefers-reduced-motion` the pill jumps instead of sliding.
 *
 * The dropdowns grow out of their trigger and their items arrive in a short
 * stagger. Manage is a two-column menu of icon cards with a one-line hint
 * each; the highlighted card's icon inverts and tilts like the marketing
 * feature cards. Hints are aria-hidden so each item's accessible name stays
 * its label.
 *
 * @module apps/binx-web/src/components/navigation/AppHeader/AppHeader.tsx
 * @author Binx Portal
 */
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowLeftRight,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  FileSignature,
  History,
  LogOut,
  Menu as MenuIcon,
  MessageSquareHeart,
  Receipt,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { logoutAction } from "@/app/(app)/actions";
import BinxMark from "@/components/BinxMark/BinxMark";
import type { CurrentUser } from "@/lib/auth";
import type { AgencyRead } from "@/lib/agencies";
import type { AppNotification } from "@/lib/notifications";
import OrgSwitcher from "@/components/navigation/OrgSwitcher/OrgSwitcher";
import NotificationBell from "@/components/notifications/NotificationBell/NotificationBell";
import AiAssistantLauncher from "@/components/ai/AiAssistantLauncher/AiAssistantLauncher";
import TutorialLauncher from "@/components/tutorial/TutorialLauncher/TutorialLauncher";
import FeedbackLauncher from "@/components/feedback/FeedbackLauncher/FeedbackLauncher";

import styles from "./AppHeader.module.scss";
import UserAvatar from "./UserAvatar/UserAvatar";

interface AppHeaderProps {
  user: CurrentUser;
  agencies: AgencyRead[];
  currentAgency: AgencyRead;
  userHasAvatar?: boolean;
  userAvatarVersion?: string | null;
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

interface ManageLink extends NavLink {
  icon: LucideIcon;
  hint: string;
}

const MANAGE_LINKS: ManageLink[] = [
  { href: "/team", label: "Team", icon: Users, hint: "People, roles and invites" },
  { href: "/invoices", label: "Invoices", icon: Receipt, hint: "Bill clients, track payments" },
  { href: "/proposals", label: "Proposals", icon: FileSignature, hint: "Priced, e-signed agreements" },
  { href: "/meetings", label: "Meetings", icon: CalendarDays, hint: "Calls and booking links" },
  { href: "/activity", label: "Activity", icon: History, hint: "What changed, and who did it" },
  { href: "/data", label: "Import & export", icon: ArrowLeftRight, hint: "Move records in and out" },
];

/** A stagger index for a menu item's entrance (see .menuItem in the SCSS). */
const stagger = (index: number) => ({ "--i": index }) as React.CSSProperties;

interface Pill {
  left: number;
  width: number;
  visible: boolean;
}

const HIDDEN_PILL: Pill = { left: 0, width: 0, visible: false };

const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const AppHeader = ({
  user,
  agencies,
  currentAgency,
  userHasAvatar = false,
  userAvatarVersion = null,
  unreadMessages = 0,
  unreadNotifications = 0,
  notifications = [],
}: AppHeaderProps) => {
  const pathname = usePathname();
  const [isSigningOut, startTransition] = useTransition();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pill, setPill] = useState<Pill>(HIDDEN_PILL);
  const navRef = useRef<HTMLElement>(null);
  const manageActive = MANAGE_LINKS.some((link) => isActivePath(pathname, link.href));

  const pillTo = useCallback((el: HTMLElement | null | undefined) => {
    if (!el) return setPill((p) => ({ ...p, visible: false }));
    setPill({ left: el.offsetLeft, width: el.offsetWidth, visible: true });
  }, []);

  // Rest the pill on the current page's link (or "Manage"), or hide it
  // when nothing in the bar matches (e.g. on /profile).
  const restPill = useCallback(() => {
    pillTo(navRef.current?.querySelector<HTMLElement>('[data-active="true"]'));
  }, [pillTo]);

  useEffect(() => {
    restPill();
    // Re-measure once web fonts settle (link widths change when they load),
    // and when the bar reflows on resize.
    document.fonts?.ready.then(restPill).catch(() => undefined);
    window.addEventListener("resize", restPill);
    return () => window.removeEventListener("resize", restPill);
  }, [restPill, pathname, unreadMessages]);

  const handleSignOut = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  const allLinks = [...NAV_LINKS, ...MANAGE_LINKS];

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.workspace}>
          <Link href="/dashboard" className={styles.brand}>
            <BinxMark className={styles.brandMark} />
            <span className={styles.brandText}>Binx</span>
          </Link>

          <span className={styles.divider} aria-hidden="true" />

          <OrgSwitcher agencies={agencies} currentAgency={currentAgency} />
        </div>

        <nav
          ref={navRef}
          className={styles.nav}
          aria-label="Primary"
          onMouseLeave={restPill}
        >
          <span
            className={styles.pill}
            aria-hidden="true"
            data-visible={pill.visible}
            style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
          />
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.navLink}
              data-active={isActivePath(pathname, link.href)}
              aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
              onMouseEnter={(e) => pillTo(e.currentTarget)}
              onFocus={(e) => pillTo(e.currentTarget)}
              onBlur={restPill}
            >
              {link.label}
              {link.href === "/messages" && unreadMessages > 0 && (
                <span className={styles.navBadge}>
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              )}
            </Link>
          ))}

          <Menu.Root>
            <Menu.Trigger
              className={styles.navTrigger}
              data-active={manageActive}
              onMouseEnter={(e) => pillTo(e.currentTarget)}
              onFocus={(e) => pillTo(e.currentTarget)}
              onBlur={restPill}
            >
              Manage
              <ChevronDown className={styles.chevron} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner
                className={styles.positioner}
                sideOffset={8}
                align="start"
              >
                <Menu.Popup className={`${styles.popup} ${styles.managePopup}`}>
                  {MANAGE_LINKS.map((link, index) => {
                    const active = isActivePath(pathname, link.href);
                    const Icon = link.icon;
                    return (
                      <Menu.LinkItem
                        key={link.href}
                        render={<Link href={link.href} />}
                        className={`${styles.menuItem} ${styles.menuCard}`}
                        data-active={active}
                        aria-current={active ? "page" : undefined}
                        style={stagger(index)}
                        closeOnClick
                      >
                        <span className={styles.menuIcon} aria-hidden="true">
                          <Icon />
                        </span>
                        <span className={styles.menuText}>
                          <span className={styles.menuLabel}>{link.label}</span>
                          <span className={styles.menuHint} aria-hidden="true">
                            {link.hint}
                          </span>
                        </span>
                        <ArrowRight className={styles.menuArrow} aria-hidden="true" />
                      </Menu.LinkItem>
                    );
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </nav>
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={styles.mobileNavToggle}
          aria-expanded={mobileNavOpen}
          aria-controls="app-mobile-nav"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? (
            <X aria-hidden="true" />
          ) : (
            <MenuIcon aria-hidden="true" />
          )}
        </button>

        <TutorialLauncher />
        <FeedbackLauncher />
        <AiAssistantLauncher agencyId={currentAgency.id} />
        <NotificationBell
          initialUnreadCount={unreadNotifications}
          initialItems={notifications}
        />

        <Menu.Root>
          <Menu.Trigger
            className={styles.accountTrigger}
            aria-label={`${user.full_name} account menu`}
          >
            <UserAvatar
              name={user.full_name}
              userId={user.id}
              hasAvatar={userHasAvatar}
              avatarVersion={userAvatarVersion}
            />
            <span className={styles.userName} aria-hidden="true">
              {user.full_name}
            </span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              className={styles.positioner}
              sideOffset={8}
              align="end"
            >
              <Menu.Popup className={`${styles.popup} ${styles.accountPopup}`}>
                <Menu.Group>
                  <Menu.GroupLabel className={styles.identity}>
                    <UserAvatar
                      name={user.full_name}
                      userId={user.id}
                      hasAvatar={userHasAvatar}
                      avatarVersion={userAvatarVersion}
                    />
                    <span className={styles.identityText}>
                      <span className={styles.identityName}>{user.full_name}</span>
                      <span className={styles.identityEmail}>{user.email}</span>
                    </span>
                  </Menu.GroupLabel>
                  <Menu.LinkItem
                    render={<Link href="/profile" />}
                    className={styles.menuItem}
                    style={stagger(0)}
                    closeOnClick
                  >
                    <UserRound className={styles.itemIcon} aria-hidden="true" />
                    Profile
                  </Menu.LinkItem>
                  <Menu.LinkItem
                    render={<Link href="/account" />}
                    className={styles.menuItem}
                    style={stagger(1)}
                    closeOnClick
                  >
                    <Settings2 className={styles.itemIcon} aria-hidden="true" />
                    Account settings
                  </Menu.LinkItem>
                  <Menu.LinkItem
                    render={<Link href="/settings" />}
                    className={styles.menuItem}
                    style={stagger(2)}
                    closeOnClick
                  >
                    <Building2 className={styles.itemIcon} aria-hidden="true" />
                    Agency settings
                  </Menu.LinkItem>
                  <Menu.LinkItem
                    render={<Link href="/feedback" />}
                    className={styles.menuItem}
                    style={stagger(3)}
                    closeOnClick
                  >
                    <MessageSquareHeart className={styles.itemIcon} aria-hidden="true" />
                    Your feedback
                  </Menu.LinkItem>
                  {user.role === "admin" && (
                    <Menu.LinkItem
                      render={<Link href="/admin" />}
                      className={styles.menuItem}
                      style={stagger(4)}
                      closeOnClick
                    >
                      <ShieldCheck className={styles.itemIcon} aria-hidden="true" />
                      Binx admin
                    </Menu.LinkItem>
                  )}
                </Menu.Group>
                <Menu.Item
                  className={`${styles.menuItem} ${styles.signOut}`}
                  style={stagger(5)}
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  <LogOut className={styles.itemIcon} aria-hidden="true" />
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {mobileNavOpen && (
        <nav
          id="app-mobile-nav"
          className={styles.mobileNav}
          aria-label="Primary"
        >
          {allLinks.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={styles.mobileNavLink}
                data-active={active}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
              >
                {link.label}
                {link.href === "/messages" && unreadMessages > 0 && (
                  <span className={styles.navBadge}>
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
};

export default AppHeader;
