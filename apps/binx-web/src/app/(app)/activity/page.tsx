/**
 * page.tsx - Activity
 *
 * The current agency's activity log — a shared, append-only record of what's
 * happened (team, clients, projects, invoicing, settings). Every member can
 * see it; sensitive entries (role changes, removals, billing) are filtered to
 * owners/admins by binx-api. The (app) layout above guards the session; this
 * re-resolves the current agency.
 *
 * @module apps/binx-web/src/app/(app)/activity/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyActivity } from "@/lib/activity";
import ActivityFeed from "@/components/activity/ActivityFeed/ActivityFeed";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Activity" };

const ActivityPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";
  const page = await getAgencyActivity(currentAgency.id, { limit: 30 });

  return (
    <div>
      <span className={styles.eyebrow}>Activity</span>
      <h1 className={styles.title}>{currentAgency.name} activity</h1>
      <p className={styles.subtitle}>
        A running record of what&apos;s happened across {currentAgency.name}.{" "}
        {canManage
          ? "You can see sensitive entries (role changes, removals, billing) that plain members can't."
          : "Some sensitive entries are only visible to owners and admins."}{" "}
        <Link href="/account" className={styles.link}>
          Your own sign-in history
        </Link>{" "}
        lives on your account page.
      </p>

      <div className={styles.body}>
        <ActivityFeed agencyId={currentAgency.id} initialPage={page} />
      </div>
    </div>
  );
};

export default ActivityPage;
