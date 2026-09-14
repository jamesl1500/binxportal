/**
 * page.tsx - Profile · Appearance
 *
 * Lets the signed-in user pick a personal accent color for their own view
 * of the staff portal. Auth is guarded by the layout above; this page only
 * needs the appearance settings.
 *
 * @module apps/binx-web/src/app/(app)/profile/appearance/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getAppearanceSettings } from "@/lib/users";
import AppearanceForm from "@/components/forms/account/AppearanceForm/AppearanceForm";

export const metadata: Metadata = { title: "Appearance" };

const AppearancePage = async () => {
  const settings = await getAppearanceSettings();

  return <AppearanceForm settings={settings} />;
};

export default AppearancePage;
