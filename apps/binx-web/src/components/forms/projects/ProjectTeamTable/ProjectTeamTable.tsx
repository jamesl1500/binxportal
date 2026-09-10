/**
 * ProjectTeamTable.tsx
 *
 * The project's team roster as a sortable, searchable table: name, contact,
 * job title, and the custom project role assigned to each person (e.g.
 * "Project Manager") — plus the controls to assign another agency member and
 * to remove someone. Only agency members can be assigned; the picker is
 * pre-filtered to the roster minus who's already on the project, so there's
 * nothing invalid to choose.
 *
 * Custom roles themselves are created in project Settings (see
 * ProjectLabelsPanel); this table only assigns an existing one. Search and
 * sort are both client-side — a project's team is small enough that filtering
 * the array in the browser beats round-tripping to binx-api.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectTeamTable/ProjectTeamTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import {
  addProjectMemberAction,
  assignProjectMemberRoleAction,
  removeProjectMemberAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { AgencyMember } from "@/lib/agencies";
import type { ProjectMember, ProjectRole } from "@/lib/projects";

import styles from "./ProjectTeamTable.module.scss";

interface ProjectTeamTableProps {
  agencyId: string;
  projectId: string;
  members: ProjectMember[];
  agencyMembers: AgencyMember[];
  roles: ProjectRole[];
}

type SortKey = "name" | "job_title" | "role";
type SortDirection = "asc" | "desc";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function sortValue(member: ProjectMember, key: SortKey): string {
  if (key === "name") return member.full_name.toLowerCase();
  if (key === "job_title") return (member.job_title ?? "").toLowerCase();
  return (member.role_name ?? "").toLowerCase();
}

const ProjectTeamTable = ({ agencyId, projectId, members, agencyMembers, roles }: ProjectTeamTableProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const assignedUserIds = useMemo(() => new Set(members.map((member) => member.user_id)), [members]);
  const assignable = useMemo(
    () => agencyMembers.filter((member) => !assignedUserIds.has(member.user_id)),
    [agencyMembers, assignedUserIds],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = members.filter((member) => {
      if (!query) return true;
      return (
        member.full_name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.job_title ?? "").toLowerCase().includes(query) ||
        (member.role_name ?? "").toLowerCase().includes(query)
      );
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const compared = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey));
      // Empty values sort last regardless of direction, then fall back to name.
      if (compared !== 0) return compared * direction;
      return a.full_name.toLowerCase().localeCompare(b.full_name.toLowerCase());
    });
  }, [members, search, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    key === sortKey ? (sortDirection === "asc" ? "ascending" : "descending") : "none";

  const sortIcon = (column: SortKey) => {
    if (column !== sortKey) return <ChevronsUpDown className={styles.sortIcon} aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp className={styles.sortIcon} aria-hidden="true" />
    ) : (
      <ArrowDown className={styles.sortIcon} aria-hidden="true" />
    );
  };

  const runMutation = (memberId: string | null, action: () => Promise<{ error?: string }>) => {
    setError(null);
    setBusyId(memberId);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleAdd = () => {
    if (!selectedUserId) return;
    runMutation(null, async () => {
      const result = await addProjectMemberAction(agencyId, projectId, selectedUserId);
      if (!result.error) setSelectedUserId("");
      return result;
    });
  };

  const handleRoleChange = (memberId: string, roleId: string) => {
    runMutation(memberId, () => assignProjectMemberRoleAction(agencyId, projectId, memberId, roleId || null));
  };

  const handleRemove = (memberId: string, fullName: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Remove ${fullName} from this project?`)) return;
    runMutation(memberId, () => removeProjectMemberAction(agencyId, projectId, memberId));
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search team…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search team"
        />

        {assignable.length > 0 && (
          <div className={styles.addRow}>
            <select
              className={styles.select}
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              aria-label="Assign a team member"
            >
              <option value="">Choose a teammate…</option>
              {assignable.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </option>
              ))}
            </select>
            <button type="button" className={styles.add} onClick={handleAdd} disabled={isPending || !selectedUserId}>
              Assign
            </button>
          </div>
        )}
      </div>

      {members.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No one is assigned yet</p>
          <p className={styles.emptyText}>Assign an agency teammate to start building this project&apos;s team.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No matching people</p>
          <p className={styles.emptyText}>Try a different search.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("name")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("name")}>
                  Member {sortIcon("name")}
                </button>
              </th>
              <th className={styles.headCell}>Contact</th>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("job_title")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("job_title")}>
                  Job title {sortIcon("job_title")}
                </button>
              </th>
              <th className={`${styles.headCell} ${styles.sortable}`} aria-sort={ariaSort("role")}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("role")}>
                  Project role {sortIcon("role")}
                </button>
              </th>
              <th className={styles.headCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((member) => {
              const isBusy = isPending && busyId === member.id;

              return (
                <tr key={member.id} className={styles.row}>
                  <td className={styles.cell}>
                    <div className={styles.person}>
                      <span className={styles.avatar} aria-hidden="true">
                        {initials(member.full_name)}
                      </span>
                      <p className={styles.name}>{member.full_name}</p>
                    </div>
                  </td>
                  <td className={styles.cell}>
                    <a href={`mailto:${member.email}`} className={styles.contactDetail}>
                      {member.email}
                    </a>
                  </td>
                  <td className={styles.cell}>
                    {member.job_title || <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.cell}>
                    <div className={styles.roleControl}>
                      <span
                        className={styles.roleDot}
                        style={{ background: member.role_color ?? "transparent" }}
                        aria-hidden="true"
                      />
                      <select
                        className={styles.roleSelect}
                        value={member.role_id ?? ""}
                        disabled={isBusy}
                        onChange={(event) => handleRoleChange(member.id, event.target.value)}
                        aria-label={`Project role for ${member.full_name}`}
                      >
                        <option value="">No role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className={styles.cell}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemove(member.id, member.full_name)}
                      disabled={isBusy}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {roles.length === 0 && members.length > 0 && (
        <p className={styles.hint}>
          No custom roles yet — create them in <strong>Settings</strong> to label who does what on this project.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProjectTeamTable;
