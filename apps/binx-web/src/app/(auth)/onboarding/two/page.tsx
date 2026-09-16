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
import Link from "next/link";
import AgencyForm from "@/components/forms/onboarding/AgencyForm/AgencyForm";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Create your agency" };

const OnboardingStepTwoPage = () => {
  return (
    <div>
      <Link href="/onboarding/one" className={styles.backLink}>
        ← Back
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 2 of 3</span>
        <h1 className={styles.title}>Create your agency</h1>
        <p className={styles.subtitle}>
          This becomes your team&apos;s home base — you can rename it any time. Add clients, projects, and teammates
          once you&apos;re in.
        </p>
      </header>

      <AgencyForm />
    </div>
  );
};

export default OnboardingStepTwoPage;
