/**
 * page.tsx - Agency Settings · Policies
 *
 * The four named policy blocks. Owner/admin edit them; members read them.
 *
 * @module apps/binx-web/src/app/(app)/settings/policies/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAgencyProfile, getCurrentAgencyContext } from "@/lib/agencies";
import AgencyPoliciesForm from "@/components/forms/agency/AgencyPoliciesForm/AgencyPoliciesForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Policies" };

const POLICIES = [
  ["terms_of_service", "Terms of service"],
  ["privacy_policy", "Privacy policy"],
  ["working_policy", "Working / client policy"],
  ["cancellation_policy", "Cancellation policy"],
] as const;

const SettingsPoliciesPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canEdit = currentAgency.role === "owner" || currentAgency.role === "admin";
  const profile = await getAgencyProfile(currentAgency.id);

  if (!canEdit) {
    const filled = POLICIES.filter(([key]) => profile[key]);
    return (
      <div>
        <p className={styles.sectionSubtitle}>Only agency owners and admins can edit policies.</p>
        {filled.length === 0 ? (
          <p className={styles.sectionSubtitle}>No policies have been written yet.</p>
        ) : (
          filled.map(([key, label]) => (
            <section key={key} className={styles.section}>
              <h2 className={styles.sectionTitle}>{label}</h2>
              <p className={styles.policyBody}>{profile[key]}</p>
            </section>
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Policies</h2>
        <p className={styles.sectionSubtitle}>
          Plain text for now — written out however you like. Shown here and, later, to clients.
        </p>
        <AgencyPoliciesForm agencyId={currentAgency.id} profile={profile} />
      </section>
    </div>
  );
};

export default SettingsPoliciesPage;
