/**
 * layout.tsx - Admin layout (Binx team)
 *
 * The Binx team admin pages share a layout with a sidebar and a top bar.
 * Platform admins only (`User.role === "admin"` — the global role, not an
 * agency role): anyone else gets a 404, so the page's existence isn't
 * advertised. binx-api enforces the same rule on `/admin/*`.
 *
 * @module apps/binx-web/src/app/(app)/admin/layout.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getFeedbackSummary } from "@/lib/feedback";

import AdminSidebar from "@/components/admin/AdminSidebar/AdminSidebar";
import AdminTopBar from "@/components/admin/AdminTopBar/AdminTopBar";

import styles from "./layout.module.scss";

export const metadata: Metadata = { title: "Binx team" };

const AdminLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    notFound();
  }

  // Only for the sidebar badge — a hiccup here shouldn't take the page down.
  const openFeedback = await getFeedbackSummary()
    .then((summary) => summary.open_total)
    .catch(() => 0);

  return (
    <div className={styles.layout}>
      <AdminSidebar openFeedback={openFeedback} />
      <div className={styles.main}>
        <AdminTopBar userName={user.full_name} />
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};

export default AdminLayout;
