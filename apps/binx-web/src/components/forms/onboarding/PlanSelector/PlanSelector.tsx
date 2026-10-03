/**
 * PlanSelector.tsx
 *
 * Onboarding step three: pick a plan, or continue on Free. Mirrors
 * PlanPanel.tsx's card grid (same catalog shape, same formatters) but with
 * onboarding-appropriate copy and actions instead of "current plan" — Free
 * goes straight through `changePlanAction` (no Stripe involved). A paid plan
 * starts a card-free 14-day trial via `startPlanTrialAction` when this
 * agency hasn't used one yet; an agency that revisits this step after
 * already trialing (or already subscribing) falls back to real Checkout
 * instead, since `startPlanTrialAction` would otherwise just 400 with no way
 * forward — see `hasUsedTrial`/`hasStripeSubscription` below. Either way the
 * next stop is step four (bulk import), which comes after the plan so
 * imports are checked against the chosen plan's (or trial's) limits.
 *
 * If the visitor arrived via a marketing pricing-page CTA, `PLAN_INTENT_STORAGE_KEY`
 * in `localStorage` carries which plan they clicked (see (marketing)/pricing/page.tsx
 * and the signup page) — read once on mount and cleared immediately, purely to
 * highlight the matching card. Best-effort only: the page works identically
 * with nothing set.
 *
 * @module apps/binx-web/src/components/forms/onboarding/PlanSelector/PlanSelector.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { changePlanAction, startPlanCheckoutAction, startPlanTrialAction } from "@/app/(app)/settings/plan/actions";
import type { PlanLimits } from "@/lib/billing";
import { formatLimit, formatPlanPrice } from "@/lib/billing-client";
import { formatMoneyCents } from "@/lib/money";
import { PLAN_INTENT_STORAGE_KEY } from "@/lib/plan-intent";

import styles from "./PlanSelector.module.scss";

const ONBOARDING_NEXT_STEP = "/onboarding/four";

interface PlanSelectorProps {
  agencyId: string;
  catalog: PlanLimits[];
  currentPlan: string;
  hasUsedTrial: boolean;
  hasStripeSubscription: boolean;
}

const PlanSelector = ({
  agencyId,
  catalog,
  currentPlan,
  hasUsedTrial,
  hasStripeSubscription,
}: PlanSelectorProps) => {
  const canTrial = !hasUsedTrial && !hasStripeSubscription;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [intentPlan, setIntentPlan] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PLAN_INTENT_STORAGE_KEY);
      if (stored) {
        window.localStorage.removeItem(PLAN_INTENT_STORAGE_KEY);
        // One-time read of a browser-only API (localStorage) that can't run
        // during SSR — not state derived from props, so the render-time
        // "adjust state" escape hatch this codebase otherwise uses for
        // avoiding setState-in-effect doesn't apply here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIntentPlan(stored);
      }
    } catch {
      // A private/locked-down browser can throw here — the page works
      // identically with no intent set, so just skip the highlight.
    }
  }, []);

  const handleFree = () => {
    setPendingPlan("free");
    startTransition(async () => {
      const result = await changePlanAction(agencyId, "free");
      setPendingPlan(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push(ONBOARDING_NEXT_STEP);
    });
  };

  const handleTrial = (plan: string) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await startPlanTrialAction(agencyId, plan);
      setPendingPlan(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push(ONBOARDING_NEXT_STEP);
    });
  };

  const handleCheckout = (plan: string) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await startPlanCheckoutAction(agencyId, plan, ONBOARDING_NEXT_STEP);
      if (result.error || !result.redirectUrl) {
        setPendingPlan(null);
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      window.location.assign(result.redirectUrl);
    });
  };

  const handlePaid = (plan: string) => (canTrial ? handleTrial(plan) : handleCheckout(plan));

  return (
    <div className={styles.grid}>
      {catalog.map((plan) => {
        const isFree = plan.key === "free";
        // currentPlan defaults to "free" for every agency that hasn't
        // subscribed yet, so a plain key match would wrongly treat Free as
        // "already chosen" on a brand-new agency's first visit. Only a paid
        // plan can be meaningfully "current" here — that only happens once
        // a real Stripe subscription exists.
        const isCurrent = plan.key === currentPlan && currentPlan !== "free";
        const isPendingThis = isPending && pendingPlan === plan.key;
        const paidLabel = canTrial ? `Start ${plan.name} trial` : `Switch to ${plan.name}`;
        return (
          <div key={plan.key} className={styles.card} data-intent={plan.key === intentPlan}>
            {plan.key === intentPlan && <p className={styles.intentBadge}>You were looking at this one</p>}
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
            {!isFree && canTrial && <p className={styles.trialNote}>14 days free, no card needed</p>}
            {isCurrent ? (
              <p className={styles.trialNote}>Your current plan</p>
            ) : (
              <button
                type="button"
                className={isFree ? styles.freeButton : styles.switch}
                onClick={() => (isFree ? handleFree() : handlePaid(plan.key))}
                disabled={isPending}
              >
                {isPendingThis ? "Setting up…" : isFree ? "Continue with Free" : paidLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PlanSelector;
