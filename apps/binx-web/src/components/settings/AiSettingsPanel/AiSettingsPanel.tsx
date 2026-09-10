/**
 * AiSettingsPanel.tsx
 *
 * The agency-wide AI budget: a monthly USD cap, a per-member daily request
 * cap, and an on/off switch. Owner/admin-editable via `updateAiSettingsAction`;
 * everyone else sees the same figures read-only (mirrors the profile/general
 * settings split — see `app/(app)/settings/general/page.tsx`).
 *
 * @module apps/binx-web/src/components/settings/AiSettingsPanel/AiSettingsPanel.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@base-ui/react/switch";

import { updateAiSettingsAction } from "@/app/(app)/settings/actions";
import type { AiSettings } from "@/lib/ai";
import { formatMoneyCents } from "@/lib/money";

import styles from "./AiSettingsPanel.module.scss";

interface AiSettingsPanelProps {
  agencyId: string;
  settings: AiSettings;
  canEdit: boolean;
}

const AiSettingsPanel = ({ agencyId, settings, canEdit }: AiSettingsPanelProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(settings.is_enabled);
  const [monthlyBudget, setMonthlyBudget] = useState((settings.monthly_budget_cents / 100).toFixed(2));
  const [dailyCap, setDailyCap] = useState(String(settings.daily_user_request_cap));
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <dl className={styles.readonlyList}>
        <div className={styles.readonlyRow}>
          <dt className={styles.readonlyLabel}>Status</dt>
          <dd className={styles.readonlyValue}>{settings.is_enabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div className={styles.readonlyRow}>
          <dt className={styles.readonlyLabel}>Monthly budget</dt>
          <dd className={styles.readonlyValue}>{formatMoneyCents(settings.monthly_budget_cents)}</dd>
        </div>
        <div className={styles.readonlyRow}>
          <dt className={styles.readonlyLabel}>Daily requests per person</dt>
          <dd className={styles.readonlyValue}>{settings.daily_user_request_cap}</dd>
        </div>
      </dl>
    );
  }

  const handleSave = () => {
    setFormError(null);
    setSuccessMessage(null);

    const budgetDollars = Number(monthlyBudget);
    const cap = Number(dailyCap);
    if (!Number.isFinite(budgetDollars) || budgetDollars < 0) {
      setFormError("Enter a valid monthly budget.");
      return;
    }
    if (!Number.isInteger(cap) || cap < 1) {
      setFormError("The daily cap must be a whole number of at least 1.");
      return;
    }

    startTransition(async () => {
      const result = await updateAiSettingsAction(agencyId, {
        isEnabled,
        monthlyBudgetCents: Math.round(budgetDollars * 100),
        dailyUserRequestCap: cap,
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("AI settings saved.");
        router.refresh();
      }
    });
  };

  return (
    <div className={styles.form}>
      <div className={styles.toggleRow}>
        <div>
          <p className={styles.toggleLabel}>AI features enabled</p>
          <p className={styles.toggleHint}>Turn every AI feature off for this agency without losing the budget below.</p>
        </div>
        <Switch.Root
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
          className={styles.switch}
          aria-label="AI features enabled"
        >
          <Switch.Thumb className={styles.thumb} />
        </Switch.Root>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="monthly-budget">
            Monthly budget (USD)
          </label>
          <input
            id="monthly-budget"
            type="number"
            min="0"
            step="0.01"
            className={styles.input}
            value={monthlyBudget}
            onChange={(event) => setMonthlyBudget(event.target.value)}
          />
          <p className={styles.toggleHint}>
            Your plan caps this at {formatMoneyCents(settings.plan_monthly_budget_cents)} / mo. Higher values
            are clamped down.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="daily-cap">
            Daily requests per person
          </label>
          <input
            id="daily-cap"
            type="number"
            min="1"
            step="1"
            className={styles.input}
            value={dailyCap}
            onChange={(event) => setDailyCap(event.target.value)}
          />
          <p className={styles.toggleHint}>Plan cap: {settings.plan_daily_user_cap} per person per day.</p>
        </div>
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="button" className={styles.submit} onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
};

export default AiSettingsPanel;
