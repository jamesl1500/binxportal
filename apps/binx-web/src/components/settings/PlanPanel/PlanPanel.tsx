/**
 * PlanPanel.tsx
 *
 * The plan catalog as a row of cards: price, the headline limits, and a
 * "Switch to this plan" button on every tier that isn't the current one
 * (owner only). Switching calls `changePlanAction` and refreshes.
 *
 * @module apps/binx-web/src/components/settings/PlanPanel/PlanPanel.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { changePlanAction } from "@/app/(app)/settings/plan/actions";
import type { PlanLimits } from "@/lib/billing";
import { formatLimit, formatPlanPrice } from "@/lib/billing-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./PlanPanel.module.scss";

interface PlanPanelProps {
  agencyId: string;
  currentPlan: string;
  catalog: PlanLimits[];
  canManage: boolean;
}

const PlanPanel = ({ agencyId, currentPlan, catalog, canManage }: PlanPanelProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const handleSwitch = (plan: string) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await changePlanAction(agencyId, plan);
      setPendingPlan(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Switched to the ${plan} plan`);
      router.refresh();
    });
  };

  return (
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
                {isPending && pendingPlan === plan.key ? "Switching…" : "Switch to this plan"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default PlanPanel;
