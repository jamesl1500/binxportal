/**
 * layout.tsx - App Layout
 *
 * Wrapper for the authenticated app area (dashboard and everything under
 * it). Requires a signed-in session — an unauthenticated visitor is sent to
 * the login page instead of ever reaching these routes. Also resolves which
 * agency the user is currently working in, since a user can belong to more
 * than one — a visitor with no agency yet is sent back into onboarding.
 * Also sets --app-accent from the user's own appearance preference (see
 * /profile/appearance), the same --portal-accent mechanism (portal)/layout.tsx
 * uses for client-portal branding — a handful of SCSS files opt into it via
 * `var(--app-accent, #{fallback})`.
 *
 * @module apps/binx-web/src/app/(app)/layout.tsx
 * @author Binx Portal
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { getCurrentUser } from "@/lib/auth";
import {
  getCurrentAgencyContext,
  getPendingDeletionAgencies,
} from "@/lib/agencies";
import { getDuePulse } from "@/lib/feedback";
import { getUnreadMessageCount } from "@/lib/messaging";
import { getNotifications } from "@/lib/notifications";
import { getPortalContext } from "@/lib/portal";
import {
  getAppearanceSettings,
  getTutorialProgress,
  getUserProfile,
} from "@/lib/users";
import AppFooter from "@/components/navigation/AppFooter/AppFooter";
import AppHeader from "@/components/navigation/AppHeader/AppHeader";
import FeedbackProvider from "@/components/feedback/FeedbackProvider/FeedbackProvider";
import FeedbackPulse from "@/components/feedback/FeedbackPulse/FeedbackPulse";
import TutorialProvider from "@/components/tutorial/TutorialProvider/TutorialProvider";
import WelcomeTourModal from "@/components/tutorial/WelcomeTourModal/WelcomeTourModal";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  // Every authenticated page inherits a "… · Binx" title and stays out of
  // search indexes. Individual pages/segments set their own `title`.
  title: { default: "Dashboard", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const AppLayout = async ({ children }: { children: React.ReactNode }) => {
  // Everything that doesn't need the agency id starts now, in parallel with
  // the user check — two sequential round trips to binx-api instead of three.
  // Each has its own fallback, so an unauthenticated request (redirected
  // below) never leaves an unhandled rejection behind.
  const agencyContext = getCurrentAgencyContext();
  agencyContext.catch(() => undefined);
  const independent = Promise.all([
    getNotifications({ limit: 8 }).catch(() => ({
      items: [],
      unread_count: 0,
      has_more: false,
    })),
    getAppearanceSettings().catch(() => ({ accent_color: null })),
    getTutorialProgress().catch(() => ({
      tour_completed: true,
      dismissed_popups: [],
    })),
    getUserProfile()
      .then(({ has_avatar, avatar_version }) => ({
        has_avatar,
        avatar_version,
      }))
      .catch(() => ({ has_avatar: false, avatar_version: null })),
    // The new-account check-in, if one is due. Never worth failing a page.
    getDuePulse().catch(() => null),
  ]);

  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { agencies, currentAgency } = await agencyContext;

  if (!currentAgency) {
    // A client contact (no agency membership) belongs in the portal, not
    // onboarding. An owner whose only agency is on its deletion hold gets the
    // page to restore it. Anyone else with no agency goes on to create one.
    const portal = await getPortalContext();
    if (portal) redirect("/portal");
    const onHold = await getPendingDeletionAgencies().catch(() => []);
    redirect(onHold.length > 0 ? "/deleted-agencies" : "/onboarding/two");
  }

  const [
    unreadMessages,
    [notifications, appearance, tutorialProgress, profile, pulseKey],
  ] = await Promise.all([getUnreadMessageCount(currentAgency.id), independent]);

  return (
    <TutorialProvider initialProgress={tutorialProgress}>
      <FeedbackProvider surface="app" agencyId={currentAgency.id}>
        <div
          className={styles.root}
          style={
            {
              "--app-accent": appearance.accent_color ?? undefined,
            } as React.CSSProperties
          }
        >
          <AppHeader
            user={user}
            agencies={agencies}
            currentAgency={currentAgency}
            userHasAvatar={profile.has_avatar}
            userAvatarVersion={profile.avatar_version}
            unreadMessages={unreadMessages}
            unreadNotifications={notifications.unread_count}
            notifications={notifications.items}
          />

          <main className={styles.content}>{children}</main>

          <AppFooter />

          <WelcomeTourModal />
          <FeedbackPulse pulseKey={pulseKey} />
          <Toaster position="bottom-right" richColors />
        </div>
      </FeedbackProvider>
    </TutorialProvider>
  );
};

export default AppLayout;
