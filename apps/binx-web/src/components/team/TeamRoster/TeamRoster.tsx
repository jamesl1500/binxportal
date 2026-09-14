/**
 * TeamRoster.tsx
 *
 * The agency's member roster: a search box, role-filter chips, and a sortable
 * table (Member / Role / Joined / Last active). Clicking a row opens the
 * MemberDetailDrawer, which owns the full CRUD (role, agency title, admin
 * notes, remove). An inline role `<select>` stays on the row for owner/admin
 * callers as a quick change without opening the drawer.
 *
 * Holds the roster in local state so a drawer mutation is reflected
 * immediately; `router.refresh()` also runs so the sibling stat grid catches
 * up.
 *
 * @module apps/binx-web/src/components/team/TeamRoster/TeamRoster.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateAgencyMemberRoleAction } from "@/app/(app)/team/actions";
import type { AgencyMember, AgencyRole } from "@/lib/agencies";
import { memberImageUrl } from "@/lib/users-client";
import MemberDetailDrawer from "@/components/team/MemberDetailDrawer/MemberDetailDrawer";

import styles from "./TeamRoster.module.scss";

interface TeamRosterProps {
  agencyId: string;
  members: AgencyMember[];
  currentUserId: string;
  canManage: boolean;
}

type RoleFilter = "all" | AgencyRole;
type SortKey = "name" | "role" | "joined" | "active";

const ROLE_FILTERS: RoleFilter[] = ["all", "owner", "admin", "member"];
const ROLE_OPTIONS: AgencyRole[] = ["owner", "admin", "member"];
const ROLE_RANK: Record<AgencyRole, number> = { owner: 0, admin: 1, member: 2 };

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatActive(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const TeamRoster = ({ agencyId, members: initialMembers, currentUserId, canManage }: TeamRosterProps) => {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("role");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  const [isSavingRole, startSavingRole] = useTransition();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = members.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      if (!term) return true;
      return (
        member.full_name.toLowerCase().includes(term) ||
        member.user_name.toLowerCase().includes(term) ||
        (member.email ?? "").toLowerCase().includes(term) ||
        (member.title ?? "").toLowerCase().includes(term)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.full_name.localeCompare(b.full_name);
        case "role":
          return ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.full_name.localeCompare(b.full_name);
        case "joined":
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
        case "active":
          return new Date(a.last_active_at ?? 0).getTime() - new Date(b.last_active_at ?? 0).getTime();
      }
    });

    return sortAsc ? sorted : sorted.reverse();
  }, [members, search, roleFilter, sortKey, sortAsc]);

  const selectedMember = members.find((member) => member.id === selectedId) ?? null;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((value) => !value);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const openMember = (memberId: string) => {
    setSelectedId(memberId);
    setDrawerOpen(true);
  };

  const applyMemberUpdate = (updated: AgencyMember) => {
    setMembers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
    router.refresh();
  };

  const applyMemberRemoval = (memberId: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
    router.refresh();
  };

  const handleInlineRole = (memberId: string, role: AgencyRole) => {
    setBusyRoleId(memberId);
    startSavingRole(async () => {
      const result = await updateAgencyMemberRoleAction(agencyId, memberId, role);
      setBusyRoleId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.member) {
        applyMemberUpdate(result.member);
        toast.success("Role updated");
      }
    });
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortAsc ? " ↑" : " ↓") : "");

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search by name, @username, email, or title"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search members"
        />
        <div className={styles.chips} role="group" aria-label="Filter by role">
          {ROLE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={styles.chip}
              data-active={roleFilter === filter}
              aria-pressed={roleFilter === filter}
              onClick={() => setRoleFilter(filter)}
            >
              {filter === "all" ? "All" : `${capitalize(filter)}s`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headCell}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("name")}>
                  Member{sortIndicator("name")}
                </button>
              </th>
              <th className={styles.headCell}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("role")}>
                  Role{sortIndicator("role")}
                </button>
              </th>
              <th className={styles.headCell}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("joined")}>
                  Joined{sortIndicator("joined")}
                </button>
              </th>
              <th className={styles.headCell}>
                <button type="button" className={styles.sortButton} onClick={() => toggleSort("active")}>
                  Last active{sortIndicator("active")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((member) => {
              const isSelf = member.user_id === currentUserId;
              return (
                <tr
                  key={member.id}
                  className={styles.row}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${member.full_name}`}
                  onClick={() => openMember(member.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openMember(member.id);
                    }
                  }}
                >
                  <td className={styles.cell}>
                    <div className={styles.person}>
                      {member.has_avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={styles.avatar}
                          src={memberImageUrl(agencyId, member.id, "avatar", member.avatar_version)}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : (
                        <span className={styles.avatar} aria-hidden="true">
                          {initials(member.full_name)}
                        </span>
                      )}
                      <div>
                        <p className={styles.name}>
                          {member.full_name}
                          {member.is_verified && (
                            <span className={styles.verified} title="Verified account" aria-label="Verified account">
                              ✓
                            </span>
                          )}
                          {isSelf && <span className={styles.youBadge}>You</span>}
                        </p>
                        <p className={styles.sub}>
                          @{member.user_name}
                          {member.title && <span className={styles.title}> · {member.title}</span>}
                        </p>
                        {member.email && <p className={styles.email}>{member.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className={styles.cell} onClick={(event) => event.stopPropagation()}>
                    {canManage && !isSelf ? (
                      <select
                        className={styles.roleSelect}
                        value={member.role}
                        disabled={isSavingRole && busyRoleId === member.id}
                        onChange={(event) => handleInlineRole(member.id, event.target.value as AgencyRole)}
                        aria-label={`Role for ${member.full_name}`}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {capitalize(role)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.roleBadge} data-role={member.role}>
                        {capitalize(member.role)}
                      </span>
                    )}
                  </td>
                  <td className={`${styles.cell} ${styles.muted}`}>{formatDate(member.joined_at)}</td>
                  <td className={`${styles.cell} ${styles.muted}`}>{formatActive(member.last_active_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && <p className={styles.empty}>No members match your filters.</p>}
      </div>

      <MemberDetailDrawer
        agencyId={agencyId}
        member={selectedMember}
        open={drawerOpen}
        canManage={canManage}
        currentUserId={currentUserId}
        onOpenChange={setDrawerOpen}
        onClosed={() => setSelectedId(null)}
        onMemberUpdated={applyMemberUpdate}
        onMemberRemoved={applyMemberRemoval}
      />
    </div>
  );
};

export default TeamRoster;
