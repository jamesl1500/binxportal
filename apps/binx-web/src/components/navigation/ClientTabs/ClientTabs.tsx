/**
 * ClientTabs.tsx
 *
 * Sub-nav for a client's pages: the dashboard overview, the projects run for
 * them, their invoices, proposals, and settings. Same pattern as ProjectTabs —
 * highlights the active tab via `usePathname`. Message threads about a client
 * live on the main /messages page now (filter by client there).
 *
 * @module apps/binx-web/src/components/navigation/ClientTabs/ClientTabs.tsx
 * @author Binx.io
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./ClientTabs.module.scss";

interface ClientTabsProps {
  clientId: string;
}

const ClientTabs = ({ clientId }: ClientTabsProps) => {
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  const tabs = [
    { href: base, label: "Dashboard" },
    { href: `${base}/projects`, label: "Projects" },
    { href: `${base}/invoices`, label: "Invoices" },
    { href: `${base}/proposals`, label: "Proposals" },
    { href: `${base}/meetings`, label: "Meetings" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className={styles.tabs} aria-label="Client">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={styles.tab} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};

export default ClientTabs;
