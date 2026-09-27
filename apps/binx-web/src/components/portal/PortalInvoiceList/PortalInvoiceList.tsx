/**
 * PortalInvoiceList.tsx
 *
 * The Invoices page's list with an All / Unpaid / Paid filter. Each row
 * shows the number and project, a status pill, a friendly due line
 * ("Due in 3 days", "2 days overdue") and the amount — what's still owed
 * while unpaid, the total once it's settled.
 *
 * @module apps/binx-web/src/components/portal/PortalInvoiceList/PortalInvoiceList.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Receipt } from "lucide-react";

import { formatMoneyCents, invoiceStatusLabel } from "@/lib/money";
import type { PortalInvoice } from "@/lib/portal";
import { dueLabel, formatDay, isUnpaid } from "@/lib/portal-insights";
import SegmentedFilter from "@/components/portal/SegmentedFilter/SegmentedFilter";

import styles from "./PortalInvoiceList.module.scss";

type Filter = "all" | "unpaid" | "paid";

const PortalInvoiceList = ({ invoices }: { invoices: PortalInvoice[] }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const now = new Date();

  const unpaidCount = invoices.filter(isUnpaid).length;
  const visible = invoices.filter((invoice) =>
    filter === "all" ? true : filter === "unpaid" ? isUnpaid(invoice) : !isUnpaid(invoice),
  );

  return (
    <div className={styles.wrap}>
      <SegmentedFilter<Filter>
        label="Filter invoices"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: invoices.length },
          { value: "unpaid", label: "Unpaid", count: unpaidCount },
          { value: "paid", label: "Paid", count: invoices.length - unpaidCount },
        ]}
      />

      {visible.length === 0 ? (
        <p className={styles.empty}>{filter === "unpaid" ? "Nothing to pay — you're all settled." : "No invoices here yet."}</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((invoice) => {
            const owed = isUnpaid(invoice);
            const due = owed ? dueLabel(invoice.due_date, now) : null;
            return (
              <li key={invoice.id}>
                <Link href={`/portal/invoices/${invoice.id}`} className={styles.row}>
                  <span className={styles.icon} aria-hidden="true">
                    <Receipt />
                  </span>
                  <span className={styles.main}>
                    <span className={styles.number}>{invoice.number}</span>
                    <span className={styles.meta}>
                      {invoice.project_name ?? `Issued ${formatDay(invoice.issue_date)}`}
                    </span>
                  </span>
                  <span className={styles.status} data-status={invoice.display_status}>
                    {invoiceStatusLabel(invoice.display_status)}
                  </span>
                  <span className={styles.amountCol}>
                    <span className={styles.amount}>
                      {formatMoneyCents(owed ? invoice.amount_due_cents : invoice.total_cents, invoice.currency)}
                    </span>
                    <span className={styles.due} data-tone={due?.tone ?? "done"}>
                      {due ? due.label : `Due ${formatDay(invoice.due_date)}`}
                    </span>
                  </span>
                  <ChevronRight className={styles.chevron} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PortalInvoiceList;
