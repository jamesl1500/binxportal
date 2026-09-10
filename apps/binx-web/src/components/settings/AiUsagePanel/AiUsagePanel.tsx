/**
 * AiUsagePanel.tsx
 *
 * Read-only spend tracker: a progress bar for this month's spend against the
 * agency's budget, the signed-in member's request count against today's per-
 * person cap, and a table of the most recent AI calls (feature, model,
 * tokens, cost, outcome). Visible to every member — only the settings above
 * it are owner/admin-gated.
 *
 * @module apps/binx-web/src/components/settings/AiUsagePanel/AiUsagePanel.tsx
 * @author Binx.io
 */
"use client";

import type { AiUsageSummary } from "@/lib/ai";
import { featureLabel } from "@/lib/ai-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./AiUsagePanel.module.scss";

interface AiUsagePanelProps {
  usage: AiUsageSummary;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const AiUsagePanel = ({ usage }: AiUsagePanelProps) => {
  const percent =
    usage.monthly_budget_cents > 0
      ? Math.min(100, Math.round((usage.month_spent_cents / usage.monthly_budget_cents) * 100))
      : 0;
  const overBudget = usage.month_spent_cents >= usage.monthly_budget_cents;

  if (!usage.configured) {
    return (
      <div className={styles.notConfigured}>
        No Anthropic API key is configured for this environment, so nothing has been spent.
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.progressBlock}>
        <div className={styles.progressHead}>
          <span className={styles.progressLabel}>
            {formatMoneyCents(usage.month_spent_cents)} of {formatMoneyCents(usage.monthly_budget_cents)} this month
          </span>
          <span className={styles.progressPercent} data-over={overBudget}>
            {percent}%
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} data-over={overBudget} style={{ width: `${percent}%` }} />
        </div>
        {overBudget && <p className={styles.overBudgetNote}>The monthly budget is used up — AI calls are blocked until it resets or is raised.</p>}
      </div>

      <p className={styles.todayLine}>
        Your requests today: <strong>{usage.today_request_count}</strong> of {usage.daily_user_request_cap}
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Who</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {usage.recent_events.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  No AI calls yet.
                </td>
              </tr>
            ) : (
              usage.recent_events.map((event) => (
                <tr key={event.id} data-status={event.status}>
                  <td>{featureLabel(event.feature)}</td>
                  <td>{event.user_name ?? "—"}</td>
                  <td>{event.input_tokens + event.output_tokens}</td>
                  <td>{formatMoneyCents(event.cost_cents)}</td>
                  <td>
                    <span className={styles.statusBadge} data-status={event.status}>
                      {event.status}
                    </span>
                  </td>
                  <td>{relativeTime(event.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AiUsagePanel;
