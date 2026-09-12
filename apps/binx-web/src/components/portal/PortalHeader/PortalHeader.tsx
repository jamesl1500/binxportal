/**
 * PortalHeader.tsx
 *
 * The slim top bar for the client portal: the agency name, the four portal
 * sections (Overview · Projects · Invoices · Messages) with the active one
 * highlighted via `usePathname`, and the signed-in contact's name + sign-out.
 *
 * @module apps/binx-web/src/components/portal/PortalHeader/PortalHeader.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/(app)/actions";

import styles from "./PortalHeader.module.scss";

interface PortalHeaderProps {
  agencyName: string;
  clientName: string;
  contactName: string;
  hasLogo: boolean;
  logoVersion: string | null;
}

const TABS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/projects", label: "Projects" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/messages", label: "Messages" },
];

const PortalHeader = ({ agencyName, clientName, contactName, hasLogo, logoVersion }: PortalHeaderProps) => {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const isActive = (href: string) => (href === "/portal" ? pathname === href : pathname.startsWith(href));

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          {hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.logo}
              src={`/api/portal/logo${logoVersion ? `?v=${encodeURIComponent(logoVersion)}` : ""}`}
              alt={`${agencyName} logo`}
            />
          )}
          <div className={styles.brandText}>
            <span className={styles.agency}>{agencyName}</span>
            <span className={styles.client}>{clientName} portal</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Client portal">
          {TABS.map((tab) => (
            <Link key={tab.href} href={tab.href} className={styles.tab} data-active={isActive(tab.href)}>
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className={styles.account}>
          <span className={styles.contact}>{contactName}</span>
          <button
            type="button"
            className={styles.signOut}
            disabled={isPending}
            onClick={() => startTransition(() => logoutAction())}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};

export default PortalHeader;
