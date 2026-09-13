/**
 * layout.tsx - Account Settings
 *
 * Shared chrome for the account-settings tabs (Preferences / Security): the
 * header and tab nav. The (app) layout above already guards for a signed-in
 * session, but this layout still redirects too since it's the first thing
 * that needs the user (each tab route also calls getCurrentUser() itself for
 * its own data — same pattern as (app)/settings' agency-settings tabs).
 *
 * @module apps/binx-web/src/app/(app)/account/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import AccountTabs from "@/components/navigation/AccountTabs/AccountTabs";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: { default: "Account", template: "%s · Binx" } };

const AccountLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div>
      <span className={styles.eyebrow}>Account</span>
      <h1 className={styles.title}>Account settings</h1>
      <p className={styles.subtitle}>
        Notifications and privacy, plus your email, password, and security activity.
      </p>

      <AccountTabs />

      {children}
    </div>
  );
};

export default AccountLayout;
