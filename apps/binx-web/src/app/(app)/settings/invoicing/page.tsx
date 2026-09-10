/**
 * page.tsx - Agency Settings · Invoicing
 *
 * The agency's client-invoicing configuration: the "from" block every invoice
 * renders, the currency, the numbering scheme, and the defaults a new invoice
 * is seeded with. Owner/admin can edit; members see a read-only summary.
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
import { getBillingSettings } from "@/lib/invoicing";
import BillingSettingsForm from "@/components/invoices/BillingSettingsForm/BillingSettingsForm";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Invoicing" };

const SettingsInvoicingPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const settings = await getBillingSettings(currentAgency.id);
  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
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
