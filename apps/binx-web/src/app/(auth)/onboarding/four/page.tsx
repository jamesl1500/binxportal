/**
 * page.tsx - Onboarding Step Four
 *
 * Optional last step: import existing clients and teammates from
 * spreadsheets (see OnboardingImport), then on to the dashboard. It comes
 * after choosing a plan so imports are checked against that plan's limits.
 * Paid plans arrive here back from Stripe Checkout (`?checkout=success|cancel`).
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/four/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import OnboardingImport from "@/components/forms/onboarding/OnboardingImport/OnboardingImport";

import styles from "../three/page.module.scss";

export const metadata: Metadata = { title: "Bring your clients & team" };

interface OnboardingStepFourPageProps {
  searchParams: Promise<{ checkout?: string }>;
}

const OnboardingStepFourPage = async ({
  searchParams,
}: OnboardingStepFourPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { checkout } = await searchParams;
  const canInvite =
    currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <Link href="/onboarding/three" className={styles.backLink}>
        ← Back
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 4 of 4 · Optional</span>
        <h1 className={styles.title}>Bring your clients &amp; team</h1>
        <p className={styles.subtitle}>
          Have them in a spreadsheet already? Import them now so{" "}
          {currentAgency.name} is ready from day one.
        </p>
      </header>

      {checkout === "success" && (
        <p className={styles.notice}>
          Thanks — your plan upgrade is being confirmed. If an import says
          you&apos;re over a limit, give it a moment and try again.
        </p>
      )}
      {checkout === "cancel" && (
        <p className={styles.notice}>
          Checkout was cancelled, so you&apos;re on the Free plan for now — you
          can upgrade any time in Settings → Plan.
        </p>
      )}

      <OnboardingImport agencyId={currentAgency.id} canInvite={canInvite} />
    </div>
  );
};

export default OnboardingStepFourPage;
