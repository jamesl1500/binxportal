/**
 * InvoiceTable.tsx
 *
 * A sortable, status-filterable table of invoices. Rows link to the invoice
 * detail page. Used both on the agency-wide `/invoices` page (with the client
 * column) and the per-client Invoices tab (without it). Status is the
 * server-derived `display_status` (draft / sent / overdue / partial / paid /
 * void).
 *
 * @module apps/binx-web/src/components/invoices/InvoiceTable/InvoiceTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import type { Invoice } from "@/lib/invoicing";
import { formatMoneyCents, invoiceStatusLabel } from "@/lib/money";

import styles from "./InvoiceTable.module.scss";

interface InvoiceTableProps {
  invoices: Invoice[];
  /** Show the client column (agency-wide list) or hide it (per-client tab). */
  showClient?: boolean;
}

type SortKey = "number" | "client_name" | "issue_date" | "due_date" | "total_cents" | "display_status";
type SortDirection = "asc" | "desc";

const STATUS_ORDER = ["draft", "sent", "overdue", "partial", "paid", "void"];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const InvoiceTable = ({ invoices, showClient = true }: InvoiceTableProps) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const invoice of invoices) {
      counts.set(invoice.display_status, (counts.get(invoice.display_status) ?? 0) + 1);
    }
    return counts;
  }, [invoices]);

  const visible = useMemo(() => {
    const filtered = invoices.filter(
      (invoice) => statusFilter === "all" || invoice.display_status === statusFilter,
    );
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let compared: number;
      if (sortKey === "total_cents") {
        compared = a.total_cents - b.total_cents;
      } else if (sortKey === "display_status") {
        compared = STATUS_ORDER.indexOf(a.display_status) - STATUS_ORDER.indexOf(b.display_status);
      } else if (sortKey === "issue_date" || sortKey === "due_date") {
        compared = a[sortKey].localeCompare(b[sortKey]);
      } else {
        compared = a[sortKey].toLowerCase().localeCompare(b[sortKey].toLowerCase());
      }
      if (compared !== 0) return compared * direction;
      return b.issue_date.localeCompare(a.issue_date);
    });
  }, [invoices, statusFilter, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "total_cents" || key === "issue_date" || key === "due_date" ? "desc" : "asc");
  };

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    key === sortKey ? (sortDirection === "asc" ? "ascending" : "descending") : "none";

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (column !== sortKey) return <ChevronsUpDown className={styles.sortIcon} aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp className={styles.sortIcon} aria-hidden="true" />
    ) : (
      <ArrowDown className={styles.sortIcon} aria-hidden="true" />
    );
  };

  const columns: [SortKey, string][] = [
    ["number", "Invoice"],
    ...((showClient ? [["client_name", "Client"]] : []) as [SortKey, string][]),
    ["issue_date", "Issued"],
    ["due_date", "Due"],
    ["total_cents", "Total"],
    ["display_status", "Status"],
  ];

  const filters = [
    { value: "all", label: `All (${invoices.length})` },
    ...STATUS_ORDER.filter((status) => statusCounts.has(status)).map((status) => ({
      value: status,
      label: `${invoiceStatusLabel(status)} (${statusCounts.get(status)})`,
    })),
  ];

  if (invoices.length === 0) {
    return <p className={styles.empty}>No invoices yet.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.filters} role="group" aria-label="Filter invoices by status">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={styles.filter}
            data-active={statusFilter === filter.value}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} className={styles.headCell} aria-sort={ariaSort(key)}>
                  <button type="button" className={styles.sortButton} onClick={() => toggleSort(key)}>
                    {label} <SortIcon column={key} />
                  </button>
                </th>
              ))}
              <th className={styles.headCell} aria-label="Amount due" />
            </tr>
          </thead>
          <tbody>
            {visible.map((invoice) => (
              <tr key={invoice.id} className={styles.row}>
                <td className={styles.cell}>
                  <Link href={`/invoices/${invoice.id}`} className={styles.number}>
                    {invoice.number}
                  </Link>
                </td>
                {showClient && <td className={styles.cell}>{invoice.client_name}</td>}
                <td className={`${styles.cell} ${styles.nowrap}`}>{formatDate(invoice.issue_date)}</td>
                <td className={`${styles.cell} ${styles.nowrap}`}>{formatDate(invoice.due_date)}</td>
                <td className={`${styles.cell} ${styles.amount}`}>
                  {formatMoneyCents(invoice.total_cents, invoice.currency)}
                </td>
                <td className={styles.cell}>
                  <span className={styles.status} data-status={invoice.display_status}>
                    {invoiceStatusLabel(invoice.display_status)}
                  </span>
                </td>
                <td className={`${styles.cell} ${styles.due}`}>
                  {invoice.amount_due_cents > 0 && invoice.display_status !== "draft"
                    ? `${formatMoneyCents(invoice.amount_due_cents, invoice.currency)} due`
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && <p className={styles.empty}>No invoices with this status.</p>}
    </div>
  );
};

export default InvoiceTable;
