/**
 * PlanUsagePanel.tsx
 *
 * Read-only usage bars for the agency's plan: active clients, non-archived
 * projects, and leads against their caps, plus this month's AI spend against
 * the plan's AI budget. An unlimited cap (Scale) renders as a plain count.
 *
 * @module apps/binx-web/src/components/settings/PlanUsagePanel/PlanUsagePanel.tsx
 * @author Binx.io
 */
"use client";

import type { Subscription } from "@/lib/billing";
import { formatLimit } from "@/lib/billing-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./PlanUsagePanel.module.scss";

interface PlanUsagePanelProps {
  subscription: Subscription;
  aiSpentCents: number;
}

interface Row {
  label: string;
  used: number;
  limit: number | null;
  render: (value: number) => string;
}

const PlanUsagePanel = ({ subscription, aiSpentCents }: PlanUsagePanelProps) => {
  const { limits, usage } = subscription;
  const rows: Row[] = [
    { label: "Clients", used: usage.clients, limit: limits.max_clients, render: String },
    { label: "Active projects", used: usage.active_projects, limit: limits.max_active_projects, render: String },
    { label: "Leads", used: usage.leads, limit: limits.max_leads, render: String },
    {
      label: "AI budget (this month)",
      used: aiSpentCents,
      limit: limits.ai_monthly_budget_cents,
      render: (value) => formatMoneyCents(value),
    },
  ];

  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const percent =
          row.limit && row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
        const atLimit = row.limit != null && row.used >= row.limit;
        return (
          <li key={row.label} className={styles.row}>
            <div className={styles.head}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value} data-at-limit={atLimit}>
                {row.render(row.used)}
                {" / "}
                {row.limit == null ? formatLimit(null) : row.render(row.limit)}
              </span>
            </div>
            <div className={styles.track}>
              <div className={styles.fill} data-at-limit={atLimit} style={{ width: `${percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default PlanUsagePanel;
