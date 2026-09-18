/**
 * page.tsx - Agency Settings · Meetings
 *
 * The agency's scheduling configuration: timezone/slot defaults and the
 * self-booking kill switch (MeetingSettingsForm), plus the recurring weekly
 * availability schedule the client portal's open-slot grid is computed from
 * (AvailabilityRulesEditor). Owner/admin can edit; members see a read-only
 * summary. Mirrors settings/invoicing/page.tsx's structure.
 *
 * @module apps/binx-web/src/app/(app)/settings/meetings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAvailabilityRules, getMeetingSettings } from "@/lib/meetings";
import MeetingSettingsForm from "@/components/settings/MeetingSettingsForm/MeetingSettingsForm";
import AvailabilityRulesEditor from "@/components/forms/meetings/AvailabilityRulesEditor/AvailabilityRulesEditor";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Meetings" };

const SettingsMeetingsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  const [settings, rules] = await Promise.all([
    getMeetingSettings(currentAgency.id),
    getAvailabilityRules(currentAgency.id),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scheduling</h2>
        <p className={styles.sectionSubtitle}>
          {canManage
            ? `Defaults for meetings booked with ${currentAgency.name}, and whether clients can book themselves from their portal.`
            : "Only agency owners and admins can change meeting settings."}
        </p>
        <MeetingSettingsForm agencyId={currentAgency.id} settings={settings} canManage={canManage} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weekly availability</h2>
        <p className={styles.sectionSubtitle}>
          {canManage
            ? "The recurring hours clients can book an open slot in. Add more than one block on a day for a split schedule."
            : "The recurring hours clients can book an open slot in."}
        </p>
        <AvailabilityRulesEditor agencyId={currentAgency.id} initialRules={rules} canManage={canManage} />
      </section>
    </div>
  );
};

export default SettingsMeetingsPage;
