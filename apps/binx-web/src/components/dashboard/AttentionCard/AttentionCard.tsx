/**
 * AttentionCard.tsx
 *
 * The dashboard's "needs attention" list — a small, prioritised set of things
 * the team should look at: overdue invoices, the caller's overdue tasks, and
 * projects that are on hold. Each row links to where it can be acted on.
 *
 * @module apps/binx-web/src/components/dashboard/AttentionCard/AttentionCard.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { AlertTriangle, PauseCircle, Receipt } from "lucide-react";

import { formatMoneyCents } from "@/lib/money";
import type { Invoice } from "@/lib/invoicing";
import type { Project } from "@/lib/projects";

import styles from "./AttentionCard.module.scss";

interface AttentionCardProps {
  overdueInvoices: Invoice[];
  overdueTaskCount: number;
  onHoldProjects: Project[];
}

const AttentionCard = ({ overdueInvoices, overdueTaskCount, onHoldProjects }: AttentionCardProps) => {
  const rows: { key: string; icon: typeof Receipt; label: string; href: string }[] = [];

  for (const invoice of overdueInvoices.slice(0, 4)) {
    rows.push({
      key: `inv-${invoice.id}`,
      icon: Receipt,
      label: `${invoice.number} — ${formatMoneyCents(invoice.amount_due_cents, invoice.currency)} overdue (${invoice.client_name})`,
      href: `/invoices/${invoice.id}`,
    });
  }

  if (overdueTaskCount > 0) {
    rows.push({
      key: "tasks",
      icon: AlertTriangle,
      label: `${overdueTaskCount} of your task${overdueTaskCount === 1 ? " is" : "s are"} overdue`,
      href: "/dashboard/my-work",
    });
  }

  for (const project of onHoldProjects.slice(0, 3)) {
    rows.push({
      key: `proj-${project.id}`,
      icon: PauseCircle,
      label: `${project.name} is on hold (${project.client_name})`,
      href: `/projects/${project.id}`,
    });
  }

  if (rows.length === 0) {
    return <p className={styles.empty}>Nothing needs attention. Nice.</p>;
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li key={row.key}>
            <Link href={row.href} className={styles.row}>
              <Icon className={styles.icon} aria-hidden="true" />
              <span className={styles.label}>{row.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default AttentionCard;
