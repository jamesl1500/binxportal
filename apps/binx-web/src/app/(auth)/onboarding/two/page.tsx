/**
 * page.tsx - Onboarding Step Two
 *
 * Second and final step of onboarding: create the user's first agency. On
 * success the agency-creating action redirects to /dashboard.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/two/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import AgencyForm from "@/components/forms/onboarding/AgencyForm/AgencyForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Create your agency" };

const OnboardingStepTwoPage = () => {
  return (
    <div>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 2 of 2</span>
        <h1 className={styles.title}>Create your agency</h1>
        <p className={styles.subtitle}>Set up the workspace your team will collaborate in.</p>
      </header>

      <AgencyForm />
    </div>
  );
};

export default OnboardingStepTwoPage;
