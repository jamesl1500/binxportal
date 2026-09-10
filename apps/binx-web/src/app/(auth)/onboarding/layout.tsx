/**
 * layout.tsx - Onboarding Layout
 *
 * Wrapper for the onboarding flow (`/onboarding/*`). Requires an
 * authenticated session — a verified, signed-in user lands here straight
 * from email verification — and shares the same two-panel visual shell as
 * the auth layout.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/layout.tsx
 * @author Binx.io
 */
import React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

import styles from "./layout.module.scss";

export const metadata: Metadata = {
  title: { default: "Get started", template: "%s · Binx" },
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    index: "01",
    title: "Tell us about you",
    text: "A couple of quick details to personalize your workspace.",
  },
  {
    index: "02",
    title: "Create your agency",
    text: "Set up the workspace your team will collaborate in.",
  },
  {
    index: "03",
    title: "You're in",
    text: "Head straight to your dashboard and get started.",
  },
];

const OnboardingLayout = async ({ children }: { children: React.ReactNode }) => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
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

          <ol className={styles.features}>
            {STEPS.map((step) => (
              <li key={step.index} className={styles.feature}>
                <span className={styles.featureIndex}>{step.index}</span>
                <div>
                  <p className={styles.featureTitle}>{step.title}</p>
                  <p className={styles.featureText}>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className={styles.footnote}>&copy; {new Date().getFullYear()} Binx.io</p>
      </aside>

      <div className={styles.content}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
};

export default OnboardingLayout;
