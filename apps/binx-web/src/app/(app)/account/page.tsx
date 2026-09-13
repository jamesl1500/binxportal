/**
 * page.tsx - Account Settings · Preferences
 *
 * Notification and privacy preferences for the signed-in user. Auth is
 * guarded by the layout above; this page only needs the settings data.
 *
 * @module apps/binx-web/src/app/(app)/account/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getNotificationSettings, getPrivacySettings } from "@/lib/users";
import NotificationSettingsForm from "@/components/forms/account/NotificationSettingsForm/NotificationSettingsForm";
import PrivacySettingsForm from "@/components/forms/account/PrivacySettingsForm/PrivacySettingsForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Preferences" };

const AccountPreferencesPage = async () => {
  const [notificationSettings, privacySettings] = await Promise.all([
    getNotificationSettings(),
    getPrivacySettings(),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Notifications</h2>
        <p className={styles.sectionSubtitle}>
          Choose which emails you&apos;d like to receive, and what shows up in the in-app notification bell.
        </p>
        <NotificationSettingsForm settings={notificationSettings} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Privacy</h2>
        <p className={styles.sectionSubtitle}>Manage what your agency teammates can see about you.</p>
        <PrivacySettingsForm settings={privacySettings} />
      </section>
    </div>
  );
};

export default AccountPreferencesPage;
