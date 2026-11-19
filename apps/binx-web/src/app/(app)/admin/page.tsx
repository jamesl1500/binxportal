/**
 * page.tsx - Binx team admin home
 *
 * The platform at a glance for the Binx team: agencies, people, revenue,
 * weekly signups, plan mix, the newest agencies, and the feedback still
 * waiting on us. Platform admins only — the admin layout 404s everyone
 * else, and binx-api enforces the same rule on `/admin/*`.
 *
 * @module apps/binx-web/src/app/(app)/admin/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getPlatformOverview } from "@/lib/admin";
import { getFeedbackInbox } from "@/lib/feedback";
import AdminOverview from "@/components/admin/AdminOverview/AdminOverview";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Admin overview" };

const AdminHomePage = async () => {
  const [overview, openFeedback] = await Promise.all([
    getPlatformOverview(),
    getFeedbackInbox({ status: "open", limit: 5 }).catch(() => ({
      items: [],
      total: 0,
    })),
  ]);

  return (
    <div>
      <span className={styles.eyebrow}>Binx team</span>
      <h1 className={styles.title}>Overview</h1>
      <p className={styles.subtitle}>
        How the platform is doing across every agency and client portal.
      </p>
      <div className={styles.body}>
        <AdminOverview
          overview={overview}
          openFeedback={openFeedback.items}
          openFeedbackTotal={openFeedback.total}
        />
      </div>
    </div>
  );
};

export default AdminHomePage;
