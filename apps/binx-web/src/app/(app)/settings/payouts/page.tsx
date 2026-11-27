/**
 * page.tsx - Settings → Payouts
 *
 * The agency's Stripe balance and payouts, for owners and admins: Stripe's
 * embedded Payouts component on the agency's own Stripe account (see
 * StripePayoutsPanel). Until Stripe is connected it points to the
 * Invoicing tab, where that happens.
 *
 * @module apps/binx-web/src/app/(app)/settings/payouts/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getStripeConnectStatus } from "@/lib/invoicing";
import StripePayoutsPanel from "@/components/invoices/StripePayoutsPanel/StripePayoutsPanel";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Payouts" };

const SettingsPayoutsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";
  const status = await getStripeConnectStatus(currentAgency.id);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Payouts</h2>
        <p className={styles.sectionSubtitle}>
          What your clients have paid online, from your own Stripe account: your balance, when Stripe pays it to your
          bank, and past payouts. Pay out now, or change your payout schedule. Stripe asks you to sign in to Stripe
          first, so only people with access to that account can move money.
        </p>
        {!canManage ? (
          <p className={styles.sectionSubtitle}>Only owners and admins can see and manage payouts.</p>
        ) : !status.connected ? (
          <p className={styles.sectionSubtitle}>
            Connect Stripe on the <Link href="/settings/invoicing">Invoicing</Link> tab first, so clients can pay
            invoices online. Your payouts appear here after that.
          </p>
        ) : (
          <StripePayoutsPanel agencyId={currentAgency.id} />
        )}
      </section>
    </div>
  );
};

export default SettingsPayoutsPage;
