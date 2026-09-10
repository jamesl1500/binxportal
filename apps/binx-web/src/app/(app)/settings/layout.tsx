/**
 * layout.tsx - Agency Settings
 *
 * Shared chrome for the agency-settings tabs (Profile / Policies / Invoicing /
 * Plan / AI / General): the header and the grouped tab nav. The (app) layout
 * above already guards for a signed-in session with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/settings/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import SettingsTabs from "@/components/navigation/SettingsTabs/SettingsTabs";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: { default: "Settings", template: "%s · Binx" } };

const SettingsLayout = async ({ children }: { children: React.ReactNode }) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  return (
    <div>
      <span className={styles.eyebrow}>Settings</span>
      <h1 className={styles.title}>Agency settings</h1>
      <p className={styles.subtitle}>
        {currentAgency.name}&apos;s profile and policies, invoicing and plan, AI limits, and general settings.
      </p>

      <SettingsTabs />

      {children}
    </div>
  );
};

export default SettingsLayout;
