/**
 * layout.tsx - App Layout
 *
 * Wrapper for the authenticated app area (dashboard and everything under
 * it). Requires a signed-in session — an unauthenticated visitor is sent to
 * the login page instead of ever reaching these routes. Also resolves which
 * agency the user is currently working in, since a user can belong to more
 * than one — a visitor with no agency yet is sent back into onboarding.
 *
 * @module apps/binx-web/src/app/(app)/layout.tsx
 * @author Binx.io
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getUnreadMessageCount } from "@/lib/messaging";
import { getNotifications } from "@/lib/notifications";
import { getPortalContext } from "@/lib/portal";
import AppHeader from "@/components/navigation/AppHeader/AppHeader";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  // Every authenticated page inherits a "… · Binx" title and stays out of
  // search indexes. Individual pages/segments set their own `title`.
  title: { default: "Dashboard", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const AppLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { agencies, currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    // A client contact (no agency membership) belongs in the portal, not
    // onboarding. Anyone else with no agency goes on to create one.
    const portal = await getPortalContext();
    redirect(portal ? "/portal" : "/onboarding/two");
  }

  const [unreadMessages, notifications] = await Promise.all([
    getUnreadMessageCount(currentAgency.id),
    getNotifications({ limit: 8 }).catch(() => ({ items: [], unread_count: 0, has_more: false })),
  ]);

  return (
    <div className={styles.root}>
      <AppHeader
        user={user}
        agencies={agencies}
        currentAgency={currentAgency}
        unreadMessages={unreadMessages}
        unreadNotifications={notifications.unread_count}
        notifications={notifications.items}
      />
      
      <main className={styles.content}>{children}</main>

      <Toaster position="bottom-right" richColors />
    </div>
  );
};

export default AppLayout;
