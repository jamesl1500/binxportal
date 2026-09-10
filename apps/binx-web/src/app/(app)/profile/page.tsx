/**
 * page.tsx - Profile
 *
 * Lets the signed-in user edit their personal details. The (app) layout
 * above this page already guards for a signed-in session, so `getCurrentUser`
 * here is only for the initial form values, not an auth check.
 *
 * @module apps/binx-web/src/app/(app)/profile/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import EditProfileForm from "@/components/forms/account/EditProfileForm/EditProfileForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Profile" };

const ProfilePage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div>
      <span className={styles.eyebrow}>Profile</span>
      <h1 className={styles.title}>Your profile</h1>
      <p className={styles.subtitle}>Update your personal details. Only you and your teammates can see these.</p>

      <div className={styles.formWrapper}>
        <EditProfileForm user={user} />
      </div>
    </div>
  );
};

export default ProfilePage;
