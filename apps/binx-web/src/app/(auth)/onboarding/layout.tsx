/**
 * layout.tsx - Onboarding Layout
 *
 * Wrapper for the onboarding flow (`/onboarding/*`). Requires an
 * authenticated session — a verified, signed-in user lands here straight
 * from email verification, unless they're already a client-portal contact,
 * in which case they're redirected to `/portal` instead — and shares the
 * same two-panel visual shell as the auth layout.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/layout.tsx
 * @author Binx.io
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPortalContext } from "@/lib/portal";
import { SITE } from "@/lib/site";

import OnboardingSteps from "./OnboardingSteps";
import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Get started", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const OnboardingLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  // A client-portal contact should never reach staff onboarding — even via
  // a stale link, a manually-edited URL, or the back button. Mirrors
  // (app)/layout.tsx's own guard; the real, unbypassable version of this
  // lives server-side in agencies/service.py::_check_not_a_portal_contact.
  if (await getPortalContext()) {
    redirect("/portal");
  }

  return (
    <div className={styles.root}>
      <aside className={styles.panel}>
        <div className={styles.panelGlow} aria-hidden="true" />

        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Binx
        </div>

        <div>
          <h1 className={styles.headline}>Set up your workspace.</h1>

          <OnboardingSteps />
        </div>

        <p className={styles.footnote}>
          &copy; {new Date().getFullYear()} {SITE.legalName}
        </p>
      </aside>

      <div className={styles.content}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
};

export default OnboardingLayout;
