/**
 * AgencyTrialPanel.tsx
 *
 * Support's trial controls for one agency: give (or extend) a card-free
 * trial of a paid plan for N days with an optional reason, or end a running
 * trial early. Overrides the self-serve one-trial-per-agency rule; binx-api
 * refuses a trial that would lower what a paying agency already has. The
 * change shows in the agency's own activity feed.
 *
 * @module apps/binx-web/src/components/admin/AgencyTrialPanel/AgencyTrialPanel.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import {
  endTrialAction,
  grantTrialAction,
  type AdminActionState,
} from "@/app/(app)/admin/actions";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { TRIAL_PLAN_OPTIONS } from "@/lib/admin-client";

import ui from "../adminUi.module.scss";

interface AgencyTrialPanelProps {
  agencyId: string;
  agencyName: string;
  trialing: boolean;
  trialPlanName: string | null;
  trialEndsAt: string | null;
}

const AgencyTrialPanel = ({
  agencyId,
  agencyName,
  trialing,
  trialPlanName,
  trialEndsAt,
}: AgencyTrialPanelProps) => {
  const [plan, setPlan] = useState<string>("pro");
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminActionState>({});
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const grant = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await grantTrialAction(agencyId, { plan, days, reason });
      setResult(outcome);
      if (!outcome.error) setReason("");
    });
  };

  const end = async () => {
    const ok = await confirm({
      title: `End ${agencyName}'s trial now?`,
      description:
        "Their limits drop back to their billed plan immediately. They'll see this in their activity feed.",
      confirmLabel: "End trial",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => setResult(await endTrialAction(agencyId)));
  };

  return (
    <div className={`${ui.stack} ${ui.tight}`}>
      {trialing && trialEndsAt ? (
        <p className={ui.empty}>
          On a <strong>{trialPlanName}</strong> trial until{" "}
          <FeedbackDate iso={trialEndsAt} />.
        </p>
      ) : (
        <p className={ui.empty}>Not on a trial.</p>
      )}

      <form onSubmit={grant} className={`${ui.stack} ${ui.tight}`}>
        <div className={ui.filters}>
          <label className={ui.field}>
            Plan
            <select
              className={ui.select}
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
            >
              {TRIAL_PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.field}>
            Days
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className={`${ui.input} ${ui.narrow}`}
            />
          </label>
        </div>
        <label className={ui.field}>
          Reason (optional)
          <input
            className={ui.input}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Onboarding took longer than expected"
          />
        </label>
        <div className={ui.filters}>
          <button type="submit" className={ui.primary} disabled={isPending}>
            {trialing ? "Set new trial" : "Give trial"}
          </button>
          {trialing && (
            <button
              type="button"
              className={ui.danger}
              onClick={end}
              disabled={isPending}
            >
              End trial now
            </button>
          )}
        </div>
      </form>

      <p role="status" aria-live="polite" className={ui.status}>
        {result.message && <span className={ui.notice}>{result.message}</span>}
        {result.error && <span className={ui.error}>{result.error}</span>}
      </p>
      {dialog}
    </div>
  );
};

export default AgencyTrialPanel;
