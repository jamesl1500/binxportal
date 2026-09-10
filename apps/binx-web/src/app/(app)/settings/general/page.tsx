/**
 * page.tsx - Agency Settings · General
 *
 * The agency name (and read-only slug), plus the owner-only danger zone.
 *
 * @module apps/binx-web/src/app/(app)/settings/general/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import AgencyGeneralForm from "@/components/forms/agency/AgencyGeneralForm/AgencyGeneralForm";
import DeleteAgencyForm from "@/components/forms/agency/DeleteAgencyForm/DeleteAgencyForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "General" };

const SettingsGeneralPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canEdit = currentAgency.role === "owner" || currentAgency.role === "admin";
  const isOwner = currentAgency.role === "owner";

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>General</h2>
        <p className={styles.sectionSubtitle}>
          {canEdit ? "Your agency's name. The URL slug is fixed." : "Only agency owners and admins can edit these settings."}
        </p>

        {canEdit ? (
          <AgencyGeneralForm agencyId={currentAgency.id} name={currentAgency.name} slug={currentAgency.slug} />
        ) : (
          <dl className={styles.readonlyList}>
            <div className={styles.readonlyRow}>
              <dt className={styles.readonlyLabel}>Agency name</dt>
              <dd className={styles.readonlyValue}>{currentAgency.name}</dd>
            </div>
            <div className={styles.readonlyRow}>
              <dt className={styles.readonlyLabel}>URL slug</dt>
              <dd className={styles.readonlyValue}>{currentAgency.slug}</dd>
            </div>
          </dl>
        )}
      </section>

      {isOwner && (
        <section className={`${styles.section} ${styles.dangerZone}`}>
          <h2 className={styles.dangerZoneTitle}>Danger zone</h2>
          <p className={styles.sectionSubtitle}>
            Permanently delete {currentAgency.name} and remove access for everyone in it. This can&apos;t be undone.
          </p>
          <DeleteAgencyForm agencyId={currentAgency.id} agencyName={currentAgency.name} />
        </section>
      )}
    </div>
  );
};

export default SettingsGeneralPage;
