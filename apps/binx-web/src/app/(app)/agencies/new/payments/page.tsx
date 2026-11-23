/**
 * page.tsx - New Agency · Get paid online
 *
 * Where the New agency flow lands: an optional prompt to connect a Stripe
 * account for the agency just created. Each agency has its own account, so a
 * second agency never inherits the first one's.
 *
 * @module apps/binx-web/src/app/(app)/agencies/new/payments/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ConnectStripeStep from "@/components/invoices/ConnectStripeStep/ConnectStripeStep";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getStripeConnectStatus } from "@/lib/invoicing";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Get paid online" };

interface NewAgencyPaymentsPageProps {
  searchParams: Promise<{ stripe?: string }>;
}

const NewAgencyPaymentsPage = async ({
  searchParams,
}: NewAgencyPaymentsPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { stripe } = await searchParams;
  const justReturned = stripe === "return";
  const status = await getStripeConnectStatus(currentAgency.id, justReturned);

  return (
    <div>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{currentAgency.name}</span>
        <h1 className={styles.title}>Get paid online</h1>
        <p className={styles.subtitle}>
          Connect a Stripe account for {currentAgency.name} so its clients can
          pay invoices right from their portal.
        </p>
      </div>

      <div className={styles.formCard}>
        <ConnectStripeStep
          agencyId={currentAgency.id}
          agencyName={currentAgency.name}
          status={status}
          canManage={
            currentAgency.role === "owner" || currentAgency.role === "admin"
          }
          returnTo="new_agency"
          justReturned={justReturned}
        />
      </div>
    </div>
  );
};

export default NewAgencyPaymentsPage;
