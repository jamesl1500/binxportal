/**
 * page.tsx - Agency Settings · Services
 *
 * The agency's services catalog: what it sells and for how much, set up
 * once and picked from on proposals, invoices and recurring schedules.
 * Owners and admins manage it; members see it read-only. Prices are in the
 * agency's invoicing currency (Settings → Invoicing).
 *
 * @module apps/binx-web/src/app/(app)/settings/services/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getBillingSettings } from "@/lib/invoicing";
import { getServices } from "@/lib/services";
import ServicesManager from "@/components/services/ServicesManager/ServicesManager";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Services" };

const SettingsServicesPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const canManage =
    currentAgency.role === "owner" || currentAgency.role === "admin";

  const [services, billing] = await Promise.all([
    getServices(currentAgency.id, { includeArchived: true }),
    getBillingSettings(currentAgency.id),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Services</h2>
        <p className={styles.sectionSubtitle}>
          {canManage
            ? "What you sell and what it costs. Pick these when building a proposal or invoice. Changing a service here never changes a proposal or invoice you've already made."
            : "What the agency sells. Pick these when building a proposal or invoice. Only owners and admins can change them."}
        </p>
        <ServicesManager
          agencyId={currentAgency.id}
          services={services}
          currency={billing.currency}
          canManage={canManage}
        />
      </section>
    </div>
  );
};

export default SettingsServicesPage;
