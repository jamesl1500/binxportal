/**
 * PortalSidebar.tsx
 *
 * The client portal's navigation: a branded sidebar (agency logo or
 * monogram, the client's name), grouped sections with live badges — unread
 * messages, unpaid invoices, proposals awaiting a decision, upcoming
 * meetings — a help card that reopens the welcome tour, and the signed-in
 * contact with sign-out.
 *
 * Desktop (≥900px) it's a fixed column beside the page. Below that it
 * collapses into a slim top bar whose menu button slides the same sidebar in
 * as a drawer — one <nav>, so there's never a duplicate set of links; the
 * closed drawer is `visibility: hidden`, which also takes it out of the tab
 * order and the accessibility tree. Closes on navigation, Escape, or a tap
 * on the scrim.
 *
 * @module apps/binx-web/src/components/portal/PortalSidebar/PortalSidebar.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileSignature,
  FolderKanban,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  X,
  type LucideIcon,
} from "lucide-react";

import { logoutAction } from "@/app/(app)/actions";
import { useOptionalPortalOnboarding } from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import { initials, KICKOFF_INVITE_STORAGE_KEY, type PortalBadges } from "@/lib/portal-insights";

import styles from "./PortalSidebar.module.scss";

interface PortalSidebarProps {
  agencyName: string;
  clientName: string;
  contactName: string;
  /** The contact's job title, or their email when there isn't one. */
  contactDetail: string | null;
  logoSrc: string | null;
  badges: PortalBadges;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Colors the badge — "alert" for anything overdue. */
  tone?: "default" | "alert";
  /** Screen-reader wording for the badge ("3 unread"). */
  badgeLabel?: string;
}

const PortalSidebar = ({ agencyName, clientName, contactName, contactDetail, logoSrc, badges }: PortalSidebarProps) => {
  const pathname = usePathname();
  const onboarding = useOptionalPortalOnboarding();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes — a render-time reset keyed
  // on the pathname, not an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Workspace",
      items: [
        { href: "/portal", label: "Home", icon: Home },
        { href: "/portal/projects", label: "Projects", icon: FolderKanban },
        {
          href: "/portal/messages",
          label: "Messages",
          icon: MessageSquare,
          badge: badges.messages,
          badgeLabel: `${badges.messages} unread`,
        },
        {
          href: "/portal/meetings",
          label: "Meetings",
          icon: CalendarDays,
          badge: badges.meetings,
          badgeLabel: `${badges.meetings} upcoming`,
        },
      ],
    },
    {
      label: "Billing & agreements",
      items: [
        {
          href: "/portal/proposals",
          label: "Proposals",
          icon: FileSignature,
          badge: badges.proposals,
          badgeLabel: `${badges.proposals} awaiting your decision`,
        },
        {
          href: "/portal/invoices",
          label: "Invoices",
          icon: Receipt,
          badge: badges.invoices,
          tone: badges.invoicesOverdue ? "alert" : "default",
          badgeLabel: `${badges.invoices} unpaid${badges.invoicesOverdue ? ", some overdue" : ""}`,
        },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/portal" ? pathname === href : pathname.startsWith(href));

  const signOut = () => {
    setOpen(false);
    // Forget any "Remind me later" on the kickoff invitation, so whoever
    // signs in next gets invited again (see PortalKickoffInvite).
    try {
      window.sessionStorage.removeItem(KICKOFF_INVITE_STORAGE_KEY);
    } catch {
      // Storage blocked — nothing to clear.
    }
    startTransition(() => logoutAction());
  };

  const brandMark = logoSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.logo} src={logoSrc} alt={`${agencyName} logo`} />
  ) : (
    <span className={styles.monogram} aria-hidden="true">
      {agencyName.trim().charAt(0).toUpperCase()}
    </span>
  );

  return (
    <>
      <div className={styles.mobileBar}>
        <div className={styles.mobileBrand}>
          {brandMark}
          <span className={styles.mobileAgency}>{agencyName}</span>
        </div>
        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="portal-sidebar"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          {!open && badges.messages + badges.proposals + badges.invoices > 0 && (
            <span className={styles.menuDot} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className={styles.scrim} data-open={open} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside id="portal-sidebar" className={styles.sidebar} data-open={open}>
        <div className={styles.brand}>
          {brandMark}
          <div className={styles.brandText}>
            <span className={styles.agency}>{agencyName}</span>
            <span className={styles.client}>{clientName} portal</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Client portal">
          {groups.map((group) => (
            <div key={group.label} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}</span>
              <ul className={styles.list}>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={styles.item}
                        data-active={active}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className={styles.itemIcon} aria-hidden="true" />
                        <span className={styles.itemLabel}>{item.label}</span>
                        {item.badge ? (
                          <span className={styles.badge} data-tone={item.tone ?? "default"}>
                            <span aria-hidden="true">{item.badge > 99 ? "99+" : item.badge}</span>
                            <span className={styles.srOnly}>, {item.badgeLabel}</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.helpCard}>
            <LifeBuoy className={styles.helpIcon} aria-hidden="true" />
            <div className={styles.helpText}>
              <span className={styles.helpTitle}>Need a hand?</span>
              <span className={styles.helpBody}>Message {agencyName} or retake the tour.</span>
            </div>
            <div className={styles.helpActions}>
              <Link href="/portal/messages" className={styles.helpLink}>
                Message us
              </Link>
              {onboarding && (
                <button type="button" className={styles.helpLink} onClick={onboarding.openTour}>
                  Take the tour
                </button>
              )}
            </div>
          </div>

          <div className={styles.account}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(contactName)}
            </span>
            <div className={styles.accountText}>
              <span className={styles.contact}>{contactName}</span>
              {contactDetail && <span className={styles.contactDetail}>{contactDetail}</span>}
            </div>
            <button
              type="button"
              className={styles.signOut}
              disabled={isPending}
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default PortalSidebar;
