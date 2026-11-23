/**
 * page.tsx - Onboarding Step Two
 *
 * Create the user's first agency. Someone who already has one (who pressed
 * Back from step three, say) gets a way forward instead of the form, because
 * submitting it again would create a second, duplicate agency.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/two/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";

import AgencyForm from "@/components/forms/onboarding/AgencyForm/AgencyForm";
import { getCurrentAgencyContext } from "@/lib/agencies";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Create your agency" };

const OnboardingStepTwoPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  return (
    <div>
      <Link href="/onboarding/one" className={styles.backLink}>
        ← Back
      </Link>

      {currentAgency ? (
        <>
          <header className={styles.header}>
            <span className={styles.eyebrow}>Step 2 of 5</span>
            <h1 className={styles.title}>You&apos;re set up</h1>
            <p className={styles.subtitle}>
              You&apos;re already in {currentAgency.name}. You can rename it any
              time in Settings.
            </p>
          </header>

          <div className={styles.actions}>
            <Link
              href={
                currentAgency.role === "owner"
                  ? "/onboarding/three"
                  : "/dashboard"
              }
              className={styles.continue}
            >
              Continue with {currentAgency.name}
            </Link>
            <Link href="/agencies/new" className={styles.secondary}>
              Create another agency
            </Link>
          </div>
        </>
      ) : (
        <>
          <header className={styles.header}>
            <span className={styles.eyebrow}>Step 2 of 5</span>
            <h1 className={styles.title}>Create your agency</h1>
            <p className={styles.subtitle}>
              This becomes your team&apos;s home base — you can rename it any
              time. Add clients, projects, and teammates once you&apos;re in.
            </p>
          </header>

          <AgencyForm />
        </>
      )}
    </div>
  );
};

export default OnboardingStepTwoPage;
