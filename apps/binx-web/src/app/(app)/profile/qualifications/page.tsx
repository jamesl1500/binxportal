/**
 * page.tsx - Profile · Skills & Experience
 *
 * Lets the signed-in user list their skills, work experience, and
 * education — shown on their teammate profile page. Auth is guarded by the
 * layout above; this page only needs the profile data.
 *
 * @module apps/binx-web/src/app/(app)/profile/qualifications/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getUserProfile } from "@/lib/users";
import QualificationsForm from "@/components/forms/account/QualificationsForm/QualificationsForm";

export const metadata: Metadata = { title: "Skills & Experience" };

const QualificationsPage = async () => {
  const profile = await getUserProfile();

  return <QualificationsForm profile={profile} />;
};

export default QualificationsPage;
