/**
 * ClientsTable.tsx
 *
 * The agency's client roster: searchable by name/contact, filterable by
 * status, linking each row to its detail page. Search and the status filter
 * are both client-side — the list page already fetches every client once,
 * and an agency's client count is small enough that filtering the array in
 * the browser is simpler than round-tripping to binx-api for it.
 *
 * @module apps/binx-web/src/components/forms/clients/ClientsTable/ClientsTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import ArchiveClientButton from "@/components/forms/clients/ArchiveClientButton/ArchiveClientButton";
import type { AgencyClient } from "@/lib/clients";

import styles from "./ClientsTable.module.scss";

interface ClientsTableProps {
  agencyId: string;
  clients: AgencyClient[];
}

type StatusFilter = "active" | "archived" | "all";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Strips a leading protocol so a website reads as a plain domain in the table, without breaking the href. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const ClientsTable = ({ agencyId, clients }: ClientsTableProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const activeCount = useMemo(() => clients.filter((client) => client.is_active).length, [clients]);
  const archivedCount = clients.length - activeCount;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients.filter((client) => {
      if (statusFilter === "active" && !client.is_active) return false;
      if (statusFilter === "archived" && client.is_active) return false;

      if (!query) return true;
      return (
        client.name.toLowerCase().includes(query) ||
        client.primary_contact_name?.toLowerCase().includes(query) ||
        client.primary_contact_email?.toLowerCase().includes(query)
      );
    });
  }, [clients, search, statusFilter]);

  if (clients.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>No clients yet</p>
        <p className={styles.emptyText}>Add your first client to start tracking who your agency works with.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filter by status">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "active"}
            className={styles.tab}
            onClick={() => setStatusFilter("active")}
          >
            Active <span className={styles.tabCount}>{activeCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "archived"}
            className={styles.tab}
            onClick={() => setStatusFilter("archived")}
          >
            Archived <span className={styles.tabCount}>{archivedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === "all"}
            className={styles.tab}
            onClick={() => setStatusFilter("all")}
          >
            All <span className={styles.tabCount}>{clients.length}</span>
          </button>
        </div>

        <input
          type="search"
          className={styles.search}
          placeholder="Search clients…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search clients"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No matching clients</p>
          <p className={styles.emptyText}>Try a different search or filter.</p>
        </div>
      ) : (
        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headCell}>Client</th>
              <th className={styles.headCell}>Primary contact</th>
              <th className={styles.headCell}>Status</th>
              <th className={styles.headCell}>Added</th>
              <th className={styles.headCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id} className={styles.row}>
                <td className={styles.cell}>
                  <Link href={`/clients/${client.id}`} className={styles.clientLink}>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(client.name)}
                    </span>
                    <div>
                      <p className={styles.name}>{client.name}</p>
                      {client.website && (
                        <span className={styles.website}>{displayUrl(client.website)}</span>
                      )}
                    </div>
                  </Link>
                </td>
                <td className={styles.cell}>
                  {client.primary_contact_name || client.primary_contact_email || client.primary_contact_phone ? (
                    <div>
                      {client.primary_contact_name && <p className={styles.contactName}>{client.primary_contact_name}</p>}
                      {client.primary_contact_email && (
                        <a href={`mailto:${client.primary_contact_email}`} className={styles.contactDetail}>
                          {client.primary_contact_email}
                        </a>
                      )}
                      {client.primary_contact_phone && <p className={styles.contactDetail}>{client.primary_contact_phone}</p>}
                    </div>
                  ) : (
                    <span className={styles.noContact}>No contact on file</span>
                  )}
                </td>
                <td className={styles.cell}>
                  <span className={styles.statusBadge} data-active={client.is_active}>
                    {client.is_active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className={`${styles.cell} ${styles.added}`}>{formatDate(client.created_at)}</td>
                <td className={styles.cell}>
                  <ArchiveClientButton agencyId={agencyId} client={client} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
};

export default ClientsTable;
