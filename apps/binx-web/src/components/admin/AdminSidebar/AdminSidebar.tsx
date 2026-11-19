/**
 * AdminSidebar component
 *
 * Navigation for the Binx team's console: Overview, the Agencies and Users
 * support tools, the Feedback inbox (badged with how much is still open) and
 * the Audit log, plus a way back to the agency app.
 * A sticky column on desktop; below 900px it becomes a horizontally
 * scrolling row of links above the page so it never pushes content down.
 *
 * Only rendered for platform admins (`User.role === "admin"` — the global
 * role, not an agency role) by the admin layout, which 404s everyone else.
 * binx-api enforces the same rule on `/admin/*`.
 *
 * @module apps/binx-web/src/components/admin/AdminSidebar/AdminSidebar.tsx
 * @author Binx Portal
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  LayoutDashboard,
  MessageSquareHeart,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

import styles from "./AdminSidebar.module.scss";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeLabel?: string;
  /** Exact match only — otherwise "/admin" would light up on every page. */
  exact?: boolean;
}

interface AdminSidebarProps {
  /** Open (new + in review + planned) feedback, for the inbox badge. */
  openFeedback?: number;
}

export function isActive(
  pathname: string,
  item: Pick<AdminNavItem, "href" | "exact">,
): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const AdminSidebar = ({ openFeedback = 0 }: AdminSidebarProps) => {
  const pathname = usePathname();

  const items: AdminNavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/admin/agencies", label: "Agencies", icon: Building2 },
    { href: "/admin/users", label: "Users", icon: Users },
    {
      href: "/admin/feedback",
      label: "Feedback inbox",
      icon: MessageSquareHeart,
      badge: openFeedback,
      badgeLabel: `${openFeedback} open`,
    },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  ];

  return (
    <aside className={styles.sidebar}>
      <span className={styles.heading}>Binx team</span>
      <nav aria-label="Admin">
        <ul className={styles.list}>
          {items.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.link}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className={styles.icon} aria-hidden="true" />
                  <span className={styles.label}>{item.label}</span>
                  {item.badge ? (
                    <span className={styles.badge} aria-label={item.badgeLabel}>
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft className={styles.icon} aria-hidden="true" />
        <span className={styles.backLabel}>Back to the app</span>
      </Link>
    </aside>
  );
};

export default AdminSidebar;
