/**
 * LeadsTable.tsx
 *
 * The lead pipeline as a table: search + status filter chips + an owner
 * filter, each row linking to the lead's detail page. Client-side filtering —
 * the list page fetches every lead once (an agency's pipeline is small).
 *
 * @module apps/binx-web/src/components/leads/LeadsTable/LeadsTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { formatMoneyCents } from "@/lib/money";
import type { LeadListItem } from "@/lib/leads";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_META, type LeadStatus } from "@/lib/leads-client";

import styles from "./LeadsTable.module.scss";

interface LeadsTableProps {
  agencyId: string;
  leads: LeadListItem[];
}

type StatusFilter = "open" | LeadStatus | "all";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

function relativeDay(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const LeadsTable = ({ leads }: LeadsTableProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const owners = useMemo(() => {
    const seen = new Map<string, string>();
    for (const lead of leads) {
      if (lead.owner_id && lead.owner_name) seen.set(lead.owner_id, lead.owner_name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter === "open" && !LEAD_STATUS_META[lead.status]?.open) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (ownerFilter === "unassigned" && lead.owner_id) return false;
      if (ownerFilter !== "all" && ownerFilter !== "unassigned" && lead.owner_id !== ownerFilter) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        (lead.contact_name ?? "").toLowerCase().includes(q) ||
        (lead.contact_email ?? "").toLowerCase().includes(q) ||
        (lead.website ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, statusFilter, ownerFilter]);

  if (leads.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No leads yet</p>
        <p className={styles.emptyText}>Add your first prospect to start building a pipeline.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={styles.chip}
              data-active={statusFilter === filter.key}
              aria-pressed={statusFilter === filter.key}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className={styles.controls}>
          <select
            className={styles.ownerSelect}
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            aria-label="Filter by owner"
          >
            <option value="all">Any owner</option>
            <option value="unassigned">Unassigned</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <input
            type="search"
            className={styles.search}
            placeholder="Search leads…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search leads"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.noMatch}>No leads match your filters.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headCell}>Lead</th>
                <th className={styles.headCell}>Status</th>
                <th className={styles.headCell}>Owner</th>
                <th className={styles.headCell}>Source</th>
                <th className={styles.headCell}>Est. value</th>
                <th className={styles.headCell}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const meta = LEAD_STATUS_META[lead.status];
                return (
                  <tr key={lead.id} className={styles.row}>
                    <td className={styles.cell}>
                      <Link href={`/leads/${lead.id}`} className={styles.leadLink}>
                        <span className={styles.name}>{lead.name}</span>
                        {lead.website && <span className={styles.sub}>{displayUrl(lead.website)}</span>}
                        {lead.contact_name && <span className={styles.sub}>{lead.contact_name}</span>}
                      </Link>
                    </td>
                    <td className={styles.cell}>
                      <span className={styles.status} style={{ borderColor: meta?.accent, color: meta?.accent }}>
                        {meta?.label ?? lead.status}
                      </span>
                    </td>
                    <td className={`${styles.cell} ${styles.muted}`}>{lead.owner_name ?? "Unassigned"}</td>
                    <td className={`${styles.cell} ${styles.muted}`}>{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</td>
                    <td className={`${styles.cell} ${styles.muted}`}>
                      {lead.estimated_value_cents != null
                        ? formatMoneyCents(lead.estimated_value_cents, "USD")
                        : "—"}
                    </td>
                    <td className={`${styles.cell} ${styles.muted}`}>{relativeDay(lead.last_activity_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LeadsTable;
