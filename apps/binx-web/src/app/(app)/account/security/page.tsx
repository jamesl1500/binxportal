/**
 * page.tsx - Account Settings · Security
 *
 * Email and password changes, recent security activity, and account
 * deletion. Auth is guarded by the layout above; getCurrentUser() is called
 * here too, only for the current email ChangeEmailForm needs.
 *
 * @module apps/binx-web/src/app/(app)/account/security/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getMyActivity } from "@/lib/activity";
import ChangeEmailForm from "@/components/forms/account/ChangeEmailForm/ChangeEmailForm";
import ChangePasswordForm from "@/components/forms/account/ChangePasswordForm/ChangePasswordForm";
import DeleteAccountForm from "@/components/forms/account/DeleteAccountForm/DeleteAccountForm";
import SecurityActivityList from "@/components/account/SecurityActivityList/SecurityActivityList";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Security" };

const AccountSecurityPage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const securityActivity = await getMyActivity({ limit: 15 });

  return (
    <div>
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

export default AccountSecurityPage;
