/**
 * page.tsx - Account Settings
 *
 * Notification, privacy, and security preferences for the signed-in user
 * (as opposed to /settings, which is agency-level). The (app) layout above
 * this page already guards for a signed-in session, so `getCurrentUser` here
 * is only to show the current email, not an auth check.
 *
 * @module apps/binx-web/src/app/(app)/account/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getNotificationSettings, getPrivacySettings } from "@/lib/users";
import { getMyActivity } from "@/lib/activity";
import NotificationSettingsForm from "@/components/forms/account/NotificationSettingsForm/NotificationSettingsForm";
import PrivacySettingsForm from "@/components/forms/account/PrivacySettingsForm/PrivacySettingsForm";
import ChangeEmailForm from "@/components/forms/account/ChangeEmailForm/ChangeEmailForm";
import ChangePasswordForm from "@/components/forms/account/ChangePasswordForm/ChangePasswordForm";
import DeleteAccountForm from "@/components/forms/account/DeleteAccountForm/DeleteAccountForm";
import SecurityActivityList from "@/components/account/SecurityActivityList/SecurityActivityList";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Account" };

const AccountSettingsPage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [notificationSettings, privacySettings, securityActivity] = await Promise.all([
    getNotificationSettings(),
    getPrivacySettings(),
    getMyActivity({ limit: 15 }),
  ]);

  return (
    <div>
      <span className={styles.eyebrow}>Account</span>
      <h1 className={styles.title}>Account settings</h1>
      <p className={styles.subtitle}>Control what Binx emails you about, and what your teammates can see.</p>

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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Email</h2>
        <p className={styles.sectionSubtitle}>
          We&apos;ll email a confirmation link to your new address before the change takes effect.
        </p>
        <ChangeEmailForm currentEmail={user.email} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Password</h2>
        <p className={styles.sectionSubtitle}>Choose a strong password you don&apos;t use anywhere else.</p>
        <ChangePasswordForm />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent security activity</h2>
        <p className={styles.sectionSubtitle}>
          Sign-ins and credential changes on your account. Only you can see this.
        </p>
        <SecurityActivityList initialPage={securityActivity} />
      </section>

      <section className={`${styles.section} ${styles.dangerZone}`}>
        <h2 className={styles.dangerZoneTitle}>Danger zone</h2>
        <p className={styles.sectionSubtitle}>
          Permanently delete your account and everything tied to it. This can&apos;t be undone.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
};

export default AccountSettingsPage;
