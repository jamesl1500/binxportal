/**
 * page.tsx - Agencies scheduled for deletion
 *
 * Where an owner lands right after deleting an agency, and where they come
 * back to during its 30-day hold. It lives outside the (app) layout because
 * someone whose only agency is on hold has no workspace to render it in.
 *
 * @module apps/binx-web/src/app/(auth)/deleted-agencies/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { DATA_KINDS } from "@/app/(app)/data/kinds";
import RestoreAgencyButton from "@/components/forms/agency/RestoreAgencyButton/RestoreAgencyButton";
import { getMyAgencies, getPendingDeletionAgencies } from "@/lib/agencies";
import { getCurrentUser } from "@/lib/auth";
import { exportHref } from "@/lib/imports-client";
import { resolveHome } from "@/lib/portal";

import styles from "./page.module.scss";

export const metadata: Metadata = {
  title: "Scheduled for deletion · Binx",
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function daysLeftLabel(iso: string): string {
  const days = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / DAY_MS));
  if (days === 0) return "Less than a day left";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

const DeletedAgenciesPage = async () => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const [pending, active] = await Promise.all([
    getPendingDeletionAgencies(),
    getMyAgencies(),
  ]);
  if (pending.length === 0) {
    redirect(await resolveHome());
  }

  return (
    <main className={styles.root}>
      <div className={styles.inner}>
        <span className={styles.eyebrow}>Binx</span>
        <h1 className={styles.title}>
          {pending.length === 1
            ? `${pending[0].name} is scheduled for deletion`
            : "Agencies scheduled for deletion"}
        </h1>
        <p className={styles.lead}>
          Your team and clients can&apos;t access{" "}
          {pending.length === 1 ? "it" : "these"} right now. Nothing is erased
          until the date below, so you can restore everything or download a
          copy first.
        </p>

        <ul className={styles.list}>
          {pending.map((agency) => (
            <li key={agency.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{agency.name}</h2>
                  <p className={styles.date}>
                    Erased on {formatDate(agency.deletion_scheduled_for)} ·{" "}
                    {daysLeftLabel(agency.deletion_scheduled_for)}
                  </p>
                </div>
                <RestoreAgencyButton
                  agencyId={agency.id}
                  agencyName={agency.name}
                />
              </div>

              <details className={styles.exports}>
                <summary>Download this agency&apos;s data</summary>
                <p className={styles.exportNote}>
                  Spreadsheets of your records. Restore the agency to get
                  uploaded files back.
                </p>
                <ul className={styles.exportList}>
                  {DATA_KINDS.map((info) => (
                    <li key={info.kind}>
                      <a href={exportHref(agency.id, info.kind, "csv")} download>
                        <Download aria-hidden="true" />
                        {info.label}
                        <span className={styles.srOnly}> as CSV</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>

        <p className={styles.footer}>
          {active.length > 0 ? (
            <Link href="/dashboard">Back to your dashboard</Link>
          ) : (
            <Link href="/onboarding/two">Create a new agency instead</Link>
          )}
        </p>
      </div>
    </main>
  );
};

export default DeletedAgenciesPage;
