/**
 * PlanPanel.tsx
 *
 * The plan catalog as a row of cards: price, the headline limits, and a
 * switch action on every tier that isn't the current one (owner only).
 * Once the agency has a real Stripe subscription, switching (including down
 * to Free) redirects into the Stripe Billing Portal's change/cancel flow;
 * before that, it redirects to a Checkout Session. A "Manage billing" link
 * (visible once there's a Stripe customer at all) opens a plain portal
 * session for updating a card or viewing invoice history.
 *
 * @module apps/binx-web/src/components/settings/PlanPanel/PlanPanel.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { openBillingPortalAction, startPlanCheckoutAction } from "@/app/(app)/settings/plan/actions";
import type { PlanLimits } from "@/lib/billing";
import { formatLimit, formatPlanPrice } from "@/lib/billing-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./PlanPanel.module.scss";

interface PlanPanelProps {
  agencyId: string;
  currentPlan: string;
  catalog: PlanLimits[];
  canManage: boolean;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
}

const PlanPanel = ({
  agencyId,
  currentPlan,
  catalog,
  canManage,
  hasStripeCustomer,
  hasStripeSubscription,
}: PlanPanelProps) => {
  const [isPending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const redirect = (result: { error?: string; redirectUrl?: string }) => {
    if (result.error || !result.redirectUrl) {
      toast.error(result.error ?? "Something went wrong");
      return;
    }
    window.location.assign(result.redirectUrl);
  };

  const handleSwitch = (plan: string) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const result = hasStripeSubscription
        ? await openBillingPortalAction(agencyId, plan)
        : await startPlanCheckoutAction(agencyId, plan);
      setPendingPlan(null);
      redirect(result);
    });
  };

  const handleManageBilling = () => {
    startTransition(async () => {
      redirect(await openBillingPortalAction(agencyId));
    });
  };

  return (
    <div>
      {hasStripeCustomer && (
        <button type="button" className={styles.manageBilling} onClick={handleManageBilling} disabled={isPending}>
          Manage billing
        </button>
      )}
      <div className={styles.grid}>
        {catalog.map((plan) => {
          const isCurrent = plan.key === currentPlan;
          return (
            <div key={plan.key} className={styles.card} data-current={isCurrent}>
              <div className={styles.cardHead}>
                <span className={styles.name}>{plan.name}</span>
                <span className={styles.price}>{formatPlanPrice(plan.price_cents_month)}</span>
              </div>
              <ul className={styles.limits}>
                <li>{formatLimit(plan.max_clients)} clients</li>
                <li>{formatLimit(plan.max_active_projects)} active projects</li>
                <li>{formatLimit(plan.max_leads)} leads</li>
                <li>{formatLimit(plan.max_team_members)} team members</li>
                <li>{formatMoneyCents(plan.ai_monthly_budget_cents)} / mo AI</li>
              </ul>
              {isCurrent ? (
                <p className={styles.currentTag}>
                  <Check aria-hidden="true" /> Current plan
                </p>
              ) : canManage ? (
                <button
                  type="button"
                  className={styles.switch}
                  onClick={() => handleSwitch(plan.key)}
                  disabled={isPending}
                >
                  {isPending && pendingPlan === plan.key ? "Redirecting…" : "Switch to this plan"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanPanel;
