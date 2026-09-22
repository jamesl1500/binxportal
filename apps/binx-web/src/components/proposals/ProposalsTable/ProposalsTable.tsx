/**
 * ProposalsTable.tsx
 *
 * A sortable, status-filterable table of proposals. Rows link to the
 * proposal detail page. Status is the server-derived `display_status`
 * (draft / sent / viewed / signed / declined / expired).
 *
 * @module apps/binx-web/src/components/proposals/ProposalsTable/ProposalsTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import type { Proposal } from "@/lib/proposals";
import { proposalStatusLabel } from "@/lib/proposals-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./ProposalsTable.module.scss";

interface ProposalsTableProps {
  proposals: Proposal[];
}

type SortKey = "title" | "recipient" | "total_cents" | "display_status" | "created_at";
type SortDirection = "asc" | "desc";

const STATUS_ORDER = ["draft", "sent", "viewed", "signed", "declined", "expired"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function recipientLabel(proposal: Proposal): string {
  return proposal.client_name ?? proposal.lead_name ?? proposal.recipient_name ?? "—";
}

const ProposalsTable = ({ proposals }: ProposalsTableProps) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const proposal of proposals) {
      counts.set(proposal.display_status, (counts.get(proposal.display_status) ?? 0) + 1);
    }
    return counts;
  }, [proposals]);

  const visible = useMemo(() => {
    const filtered = proposals.filter(
      (proposal) => statusFilter === "all" || proposal.display_status === statusFilter,
    );
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let compared: number;
      if (sortKey === "total_cents") {
        compared = a.total_cents - b.total_cents;
      } else if (sortKey === "display_status") {
        compared = STATUS_ORDER.indexOf(a.display_status) - STATUS_ORDER.indexOf(b.display_status);
      } else if (sortKey === "created_at") {
        compared = a.created_at.localeCompare(b.created_at);
      } else if (sortKey === "recipient") {
        compared = recipientLabel(a).toLowerCase().localeCompare(recipientLabel(b).toLowerCase());
      } else {
        compared = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
      }
      if (compared !== 0) return compared * direction;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [proposals, statusFilter, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "total_cents" || key === "created_at" ? "desc" : "asc");
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
    ["title", "Proposal"],
    ["recipient", "Client / lead"],
    ["total_cents", "Total"],
    ["display_status", "Status"],
    ["created_at", "Created"],
  ];

  const filters = [
    { value: "all", label: `All (${proposals.length})` },
    ...STATUS_ORDER.filter((status) => statusCounts.has(status)).map((status) => ({
      value: status,
      label: `${proposalStatusLabel(status)} (${statusCounts.get(status)})`,
    })),
  ];

  if (proposals.length === 0) {
    return <p className={styles.empty}>No proposals yet.</p>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.filters} role="group" aria-label="Filter proposals by status">
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
            </tr>
          </thead>
          <tbody>
            {visible.map((proposal) => (
              <tr key={proposal.id} className={styles.row}>
                <td className={styles.cell}>
                  <Link href={`/proposals/${proposal.id}`} className={styles.titleLink}>
                    {proposal.title}
                  </Link>
                </td>
                <td className={styles.cell}>{recipientLabel(proposal)}</td>
                <td className={`${styles.cell} ${styles.amount}`}>
                  {formatMoneyCents(proposal.total_cents, proposal.currency)}
                </td>
                <td className={styles.cell}>
                  <span className={styles.status} data-status={proposal.display_status}>
                    {proposalStatusLabel(proposal.display_status)}
                  </span>
                </td>
                <td className={`${styles.cell} ${styles.nowrap}`}>{formatDate(proposal.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && <p className={styles.empty}>No proposals with this status.</p>}
    </div>
  );
};

export default ProposalsTable;
