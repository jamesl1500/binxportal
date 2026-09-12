/**
 * page.tsx - Agency Settings · Invoicing
 *
 * The agency's client-invoicing configuration: the "from" block every invoice
 * renders, the currency, the numbering scheme, the defaults a new invoice is
 * seeded with, and Stripe Connect onboarding status (so clients can pay
 * invoices online). Owner/admin can edit; members see a read-only summary.
 *
 * This is client-invoicing setup. The agency's own subscription lives on the
 * Plan tab; individual invoices are managed from the Invoices page.
 *
 * @module apps/binx-web/src/app/(app)/settings/invoicing/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getBillingSettings, getStripeConnectStatus } from "@/lib/invoicing";
import BillingSettingsForm from "@/components/invoices/BillingSettingsForm/BillingSettingsForm";
import StripeConnectPanel from "@/components/invoices/StripeConnectPanel/StripeConnectPanel";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Invoicing" };

interface SettingsInvoicingPageProps {
  searchParams: Promise<{ stripe?: string }>;
}

const SettingsInvoicingPage = async ({ searchParams }: SettingsInvoicingPageProps) => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const { stripe } = await searchParams;
  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  const [settings, stripeStatus] = await Promise.all([
    getBillingSettings(currentAgency.id),
    getStripeConnectStatus(currentAgency.id, stripe === "return"),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Online payment</h2>
        <p className={styles.sectionSubtitle}>
          Connect Stripe so clients can pay invoices directly from their portal — money settles into{" "}
          {currentAgency.name}&apos;s own Stripe account.
        </p>
        <StripeConnectPanel agencyId={currentAgency.id} status={stripeStatus} canManage={canManage} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Invoicing</h2>
        <p className={styles.sectionSubtitle}>
          {canManage
            ? `How invoices for ${currentAgency.name} look and are numbered. Manage individual invoices from the Invoices page.`
            : "Only agency owners and admins can change invoicing settings."}
        </p>
        <BillingSettingsForm agencyId={currentAgency.id} settings={settings} canManage={canManage} />
      </section>
    </div>
  );
};

export default SettingsInvoicingPage;
