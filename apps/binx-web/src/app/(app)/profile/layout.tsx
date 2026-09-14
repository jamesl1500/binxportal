/**
 * layout.tsx - Profile
 *
 * Shared chrome for the profile tabs (Details / Skills & Experience /
 * Photos / Appearance): the header and tab nav. The (app) layout above
 * already guards for a signed-in session, but this layout still redirects
 * too since it's the first thing that needs the user — same pattern as
 * (app)/account's tabs.
 *
 * @module apps/binx-web/src/app/(app)/profile/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import ProfileTabs from "@/components/navigation/ProfileTabs/ProfileTabs";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: { default: "Profile", template: "%s · Binx" } };

const ProfileLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div>
      <span className={styles.eyebrow}>Profile</span>
      <h1 className={styles.title}>Your profile</h1>
      <p className={styles.subtitle}>
        Update your personal details, photos, skills, and how the app looks for you.
      </p>

      <ProfileTabs />

      {children}
    </div>
  );
};

export default ProfileLayout;
