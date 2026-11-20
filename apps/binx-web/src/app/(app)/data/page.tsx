/**
 * page.tsx - Import & export
 *
 * One place to move data in and out: a card per kind with CSV / Excel
 * downloads of everything of that kind and, where importing is supported, a
 * link to its import wizard. An export's columns match the importer's, so a
 * downloaded file re-imports as-is.
 *
 * @module apps/binx-web/src/app/(app)/data/page.tsx
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Upload } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { exportHref } from "@/lib/imports-client";

import { DATA_KINDS } from "./kinds";
import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Import & export" };

const DataPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const isAdmin = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Manage</span>
          <h1 className={styles.title}>Import &amp; export</h1>
          <p className={styles.subtitle}>
            Download any of your data as a spreadsheet, or bring it in from one. Exported files use the same columns
            the importer expects, so you can edit one and import it straight back.
          </p>
        </div>
      </div>

      <ul className={styles.grid}>
        {DATA_KINDS.map((info) => {
          const canImport = info.importable && (!info.importable.adminOnly || isAdmin);
          return (
            <li key={info.kind} className={styles.card}>
              <h2 className={styles.cardTitle}>{info.label}</h2>
              <p className={styles.cardText}>{info.description}</p>
              <div className={styles.actions}>
                <a href={exportHref(currentAgency.id, info.kind, "csv")} download className={styles.secondary}>
                  <Download aria-hidden="true" />
                  CSV<span className={styles.srOnly}> export of {info.label.toLowerCase()}</span>
                </a>
                <a href={exportHref(currentAgency.id, info.kind, "xlsx")} download className={styles.secondary}>
                  <Download aria-hidden="true" />
                  Excel<span className={styles.srOnly}> export of {info.label.toLowerCase()}</span>
                </a>
                {canImport && (
                  <Link href={`/data/import/${info.kind}`} className={styles.primary}>
                    <Upload aria-hidden="true" />
                    Import<span className={styles.srOnly}> {info.label.toLowerCase()}</span>
                  </Link>
                )}
                {!info.importable && <span className={styles.note}>Export only</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DataPage;
