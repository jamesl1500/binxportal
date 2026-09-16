/**
 * page.tsx - Onboarding Step Three
 *
 * Final step of onboarding: pick a plan, or continue on Free. Every agency
 * already lands on Free the moment anything first touches billing (see
 * billing/service.py::get_or_create_subscription) — this just makes that
 * choice visible and explicit up front instead of leaving it silent.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/three/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getPlanCatalog } from "@/lib/billing";
import PlanSelector from "@/components/forms/onboarding/PlanSelector/PlanSelector";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Choose your plan" };

const OnboardingStepThreePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const catalog = await getPlanCatalog(currentAgency.id);

  return (
    <div>
      <Link href="/onboarding/two" className={styles.backLink}>
        ← Back
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 3 of 3</span>
        <h1 className={styles.title}>Choose your plan</h1>
        <p className={styles.subtitle}>
          Free to start, no credit card required. Upgrade any time as your team grows.
        </p>
      </header>

      <PlanSelector agencyId={currentAgency.id} catalog={catalog} />
    </div>
  );
};

export default OnboardingStepThreePage;
