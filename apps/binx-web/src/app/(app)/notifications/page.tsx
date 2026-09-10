/**
 * page.tsx - Notifications
 *
 * The full history of the signed-in user's in-app notifications, across every
 * agency they belong to. The (app) layout above already guards for a signed-in
 * session; `getCurrentUser` here is just the belt-and-braces redirect.
 *
 * @module apps/binx-web/src/app/(app)/notifications/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import NotificationList from "@/components/notifications/NotificationList/NotificationList";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Notifications" };

const NotificationsPage = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const page = await getNotifications({ limit: 20 });

  return (
    <div>
      <span className={styles.eyebrow}>Notifications</span>
      <h1 className={styles.title}>What&apos;s happened</h1>
      <p className={styles.subtitle}>
        Invites, invoices, project assignments and mentions from across your agencies.{" "}
        <Link href="/account" className={styles.link}>
          Manage what shows up here
        </Link>
        .
      </p>

      <div className={styles.body}>
        <NotificationList initialPage={page} />
      </div>
    </div>
  );
};

export default NotificationsPage;
