/**
 * layout.tsx - Client Portal
 *
 * Shell for the client-facing `/portal` area. Guards: an unauthenticated
 * visitor goes to login; a signed-in user who isn't a client contact is a
 * staff member and belongs on `/dashboard`. Everyone else gets the portal
 * chrome — a branded sidebar with live badges (see PortalSidebar) — plus the
 * client onboarding layer: the first-visit welcome tour and the state the
 * home page's getting-started checklist reads (PortalOnboardingProvider).
 *
 * The badge lists are the same `cache()`-wrapped fetches the pages below
 * use, so a page that also needs them doesn't pay for a second request. A
 * failed badge fetch just means no badge — never a broken shell.
 *
 * @module apps/binx-web/src/app/(portal)/layout.tsx
 * @author Binx.io
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import { getCurrentUser } from "@/lib/auth";
import {
  getPortalContext,
  getPortalConversations,
  getPortalInvoices,
  getPortalMeetings,
  getPortalPendingKickoffs,
  getPortalProposals,
} from "@/lib/portal";
import { buildBadges, firstName, PORTAL_TOUR_ID } from "@/lib/portal-insights";
import { getTutorialProgress } from "@/lib/users";
import PortalBrandVars from "@/components/portal/PortalBrandVars/PortalBrandVars";
import PortalKickoffInvite from "@/components/portal/PortalKickoffInvite/PortalKickoffInvite";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import PortalSidebar from "@/components/portal/PortalSidebar/PortalSidebar";
import PortalWelcomeTour from "@/components/portal/PortalWelcomeTour/PortalWelcomeTour";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const PortalLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const context = await getPortalContext();
  if (!context) {
    redirect("/dashboard");
  }

  const [conversations, invoices, proposals, meetings, pendingKickoffs, tutorialProgress] = await Promise.all([
    getPortalConversations().catch(() => []),
    getPortalInvoices().catch(() => []),
    getPortalProposals().catch(() => []),
    getPortalMeetings().catch(() => []),
    getPortalPendingKickoffs().catch(() => []),
    // Default to "tour already seen" on failure — better to skip a tour than
    // to pop it on every page load while the API is unhappy.
    getTutorialProgress().catch(() => ({ tour_completed: true, dismissed_popups: [PORTAL_TOUR_ID] })),
  ]);
  const badges = buildBadges({ conversations, invoices, proposals, meetings, now: new Date() });

  // A client's own branding overrides the agency's; unset falls back to the
  // agency's own AgencyProfile brand_color/logo, then the app default — see
  // client_portal/service.py::portal_client_read / portal_logo_path.
  const primaryColor = context.client.primary_color ?? context.agency.brand_color ?? undefined;
  const accentColor = context.client.accent_color ?? undefined;
  const hasLogo = context.client.has_logo || context.agency.has_logo;
  const logoVersion = (context.client.has_logo ? context.client.logo_version : context.agency.logo_version) ?? null;
  const logoSrc = hasLogo ? `/api/portal/logo${logoVersion ? `?v=${encodeURIComponent(logoVersion)}` : ""}` : null;

  return (
    <PortalOnboardingProvider initialProgress={tutorialProgress}>
      <div
        className={styles.root}
        style={{ "--portal-primary": primaryColor, "--portal-accent": accentColor } as React.CSSProperties}
      >
        <PortalBrandVars primary={primaryColor} accent={accentColor} />
        <PortalSidebar
          agencyName={context.agency.name}
          clientName={context.client.name}
          contactName={user.full_name}
          contactDetail={context.contact.title || context.contact.email}
          logoSrc={logoSrc}
          badges={badges}
        />
        <main className={styles.main}>
          <div className={styles.content}>{children}</div>
        </main>
        <PortalWelcomeTour
          agencyName={context.agency.name}
          clientName={context.client.name}
          contactFirstName={firstName(user.full_name)}
          logoSrc={logoSrc}
        />
        {/* Waits for the welcome tour above to close before it opens. */}
        <PortalKickoffInvite
          kickoffs={pendingKickoffs}
          agencyName={context.agency.name}
          contactFirstName={firstName(user.full_name)}
          logoSrc={logoSrc}
        />
        <Toaster position="bottom-right" richColors />
      </div>
    </PortalOnboardingProvider>
  );
};

export default PortalLayout;
