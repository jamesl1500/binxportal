/**
 * layout.tsx - Dashboard
 *
 * Shared chrome for the dashboard tabs (Overview / My work / Pulse): a
 * greeting header and the tab nav. The (app) layout above already guards for
 * a signed-in session with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/layout.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getMyWork } from "@/lib/dashboard";
import DashboardTabs from "@/components/navigation/DashboardTabs/DashboardTabs";

import styles from "./page.module.scss";

const DashboardLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const myWork = await getMyWork(currentAgency.id).catch(() => null);
  const firstName = user.full_name.trim().split(/\s+/)[0] || user.full_name;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <span className={styles.eyebrow}>Dashboard</span>
      <h1 className={styles.title}>
        {greeting}, {firstName}.
      </h1>
      <p className={styles.subtitle}>What&apos;s happening across {currentAgency.name}.</p>

      <div className={styles.tabsWrap}>
        <DashboardTabs myWorkCount={myWork?.total_open ?? 0} />
      </div>

      {children}
    </div>
  );
};

export default DashboardLayout;
