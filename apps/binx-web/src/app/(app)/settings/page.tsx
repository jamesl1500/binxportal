/**
 * page.tsx - Agency Settings · Profile
 *
 * Branding (logo, cover, colour, tagline) and the about / contact / social
 * details. Editing is owner/admin; members see a read-only summary.
 *
 * @module apps/binx-web/src/app/(app)/settings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAgencyProfile, getCurrentAgencyContext } from "@/lib/agencies";
import AgencyBrandingForm from "@/components/forms/agency/AgencyBrandingForm/AgencyBrandingForm";
import AgencyProfileForm from "@/components/forms/agency/AgencyProfileForm/AgencyProfileForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Profile" };

const FIELDS = [
  ["tagline", "Tagline"],
  ["about", "About"],
  ["founded_year", "Founded"],
  ["headquarters", "Headquarters"],
  ["contact_email", "Contact email"],
  ["contact_phone", "Contact phone"],
  ["website", "Website"],
  ["address", "Address"],
  ["linkedin_url", "LinkedIn"],
  ["twitter_url", "X / Twitter"],
  ["instagram_url", "Instagram"],
  ["facebook_url", "Facebook"],
] as const;

const SettingsProfilePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canEdit = currentAgency.role === "owner" || currentAgency.role === "admin";
  const profile = await getAgencyProfile(currentAgency.id);

  if (!canEdit) {
    const rows = FIELDS.map(([key, label]) => ({ label, value: profile[key] })).filter(
      (row) => row.value !== null && row.value !== "" && row.value !== undefined,
    );

    return (
      <div>
        <p className={styles.sectionSubtitle}>Only agency owners and admins can edit these settings.</p>
        {rows.length === 0 ? (
          <p className={styles.sectionSubtitle}>No agency details have been filled in yet.</p>
        ) : (
          <dl className={styles.readonlyList}>
            {rows.map((row) => (
              <div key={row.label} className={styles.readonlyRow}>
                <dt className={styles.readonlyLabel}>{row.label}</dt>
                <dd className={styles.readonlyValue}>{String(row.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Branding</h2>
        <p className={styles.sectionSubtitle}>Your logo, cover image, brand colour, and tagline.</p>
        <AgencyBrandingForm agencyId={currentAgency.id} profile={profile} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>About</h2>
        <p className={styles.sectionSubtitle}>Who you are, where you are, and how to reach you.</p>
        <AgencyProfileForm agencyId={currentAgency.id} profile={profile} />
      </section>
    </div>
  );
};

export default SettingsProfilePage;
