/**
 * page.tsx - Onboarding Step Five
 *
 * Optional last step: connect a Stripe account for the agency just created,
 * so its clients can pay invoices online. It comes last because Stripe's
 * onboarding leaves the site, and comes back here when it's done.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/five/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import ConnectStripeStep from "@/components/invoices/ConnectStripeStep/ConnectStripeStep";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getStripeConnectStatus } from "@/lib/invoicing";

import styles from "../three/page.module.scss";

export const metadata: Metadata = { title: "Get paid online" };

interface OnboardingStepFivePageProps {
  searchParams: Promise<{ stripe?: string }>;
}

const OnboardingStepFivePage = async ({
  searchParams,
}: OnboardingStepFivePageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { stripe } = await searchParams;
  const justReturned = stripe === "return";
  const status = await getStripeConnectStatus(currentAgency.id, justReturned);

  return (
    <div>
      <Link href="/onboarding/four" className={styles.backLink}>
        ← Back
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>Step 5 of 5 · Optional</span>
        <h1 className={styles.title}>Get paid online</h1>
        <p className={styles.subtitle}>
          Connect Stripe so clients can pay {currentAgency.name}&apos;s invoices
          right from their portal. Money goes straight to your Stripe account.
        </p>
      </header>

      <ConnectStripeStep
        agencyId={currentAgency.id}
        agencyName={currentAgency.name}
        status={status}
        canManage={
          currentAgency.role === "owner" || currentAgency.role === "admin"
        }
        returnTo="onboarding"
        justReturned={justReturned}
      />
    </div>
  );
};

export default OnboardingStepFivePage;
