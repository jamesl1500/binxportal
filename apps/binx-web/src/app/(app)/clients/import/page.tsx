/**
 * page.tsx - Import clients
 *
 * Bulk-add clients from a .csv or .xlsx file via BulkImportWizard (upload →
 * match columns → review → import). Duplicates are skipped and, past the
 * plan's client limit, only the rows that fit are imported.
 *
 * @module apps/binx-web/src/app/(app)/clients/import/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import BulkImportWizard from "@/components/imports/BulkImportWizard/BulkImportWizard";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Import clients" };

const ImportClientsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  return (
    <div>
      <Link href="/clients" className={styles.backLink}>
        ← All clients
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Clients</span>
          <h1 className={styles.title}>Import clients</h1>
          <p className={styles.subtitle}>
            Bring your client list over from a spreadsheet. Only the client name
            is required, and clients you already have are skipped.
          </p>
        </div>
      </div>

      <div className={styles.formCard}>
        <BulkImportWizard
          agencyId={currentAgency.id}
          kind="clients"
          nextHref="/clients"
          nextLabel="View clients"
        />
      </div>
    </div>
  );
};

export default ImportClientsPage;
