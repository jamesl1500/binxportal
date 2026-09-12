/**
 * page.tsx - Agency Settings · Plan
 *
 * The agency's subscription plan: current tier + usage bars (clients /
 * projects / leads / AI budget vs. the plan's limits), visible to every
 * member, and the plan catalog with a "switch" action available to the owner
 * only. Switching redirects to Stripe Checkout (new subscriber) or the
 * Stripe Billing Portal (existing subscriber) — see PlanPanel.
 *
 * @module apps/binx-web/src/app/(app)/settings/plan/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAiUsage } from "@/lib/ai";
import { getPlanCatalog, getSubscription } from "@/lib/billing";
import PlanPanel from "@/components/settings/PlanPanel/PlanPanel";
import PlanUsagePanel from "@/components/settings/PlanUsagePanel/PlanUsagePanel";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Plan" };

const SettingsPlanPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const isOwner = currentAgency.role === "owner";
  const [subscription, catalog, usage] = await Promise.all([
    getSubscription(currentAgency.id),
    getPlanCatalog(currentAgency.id),
    getAiUsage(currentAgency.id),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan &amp; usage</h2>
        <p className={styles.sectionSubtitle}>
          {currentAgency.name} is on the <strong>{subscription.limits.name}</strong> plan. Usage is measured
          against that tier&apos;s limits.
        </p>
        <PlanUsagePanel subscription={subscription} aiSpentCents={usage.month_spent_cents} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plans</h2>
        <p className={styles.sectionSubtitle}>
          {isOwner ? "Switch plans at any time." : "Only the agency owner can change the plan."}
        </p>
        <PlanPanel
          agencyId={currentAgency.id}
          currentPlan={subscription.plan}
          catalog={catalog}
          canManage={isOwner}
          hasStripeCustomer={subscription.has_stripe_customer}
          hasStripeSubscription={subscription.has_stripe_subscription}
        />
      </section>
    </div>
  );
};

export default SettingsPlanPage;
