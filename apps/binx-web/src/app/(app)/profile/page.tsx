/**
 * page.tsx - Profile · Details
 *
 * Lets the signed-in user edit their personal details. Auth is guarded by
 * the layout above; this page only needs the user for the form's initial
 * values.
 *
 * @module apps/binx-web/src/app/(app)/profile/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import EditProfileForm from "@/components/forms/account/EditProfileForm/EditProfileForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Details" };

const ProfilePage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className={styles.formWrapper}>
      <EditProfileForm user={user} />
    </div>
  );
};

export default ProfilePage;
