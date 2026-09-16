/**
 * page.tsx - Onboarding Step One
 *
 * First step of onboarding: a couple of quick profile details beyond what
 * signup already captured. The layout above this page already guards for an
 * authenticated session.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/one/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import ProfileForm from "@/components/forms/onboarding/ProfileForm/ProfileForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "About you" };

const OnboardingStepOnePage = () => {
  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 1 of 3</span>
        <h1 className={styles.title}>Tell us about you</h1>
        <p className={styles.subtitle}>A couple of quick details to personalize your workspace.</p>
      </header>

      <ProfileForm />
    </div>
  );
};

export default OnboardingStepOnePage;
