/**
 * MemberMultiSelect.tsx
 *
 * A filterable checkbox list of agency members — used to pick who's in a new
 * conversation and who to add to an existing group. Controlled: the parent
 * owns the selected id set.
 *
 * @module apps/binx-web/src/components/messaging/MemberMultiSelect/MemberMultiSelect.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";

import type { AgencyMember } from "@/lib/agencies";

import styles from "./MemberMultiSelect.module.scss";

interface MemberMultiSelectProps {
  members: AgencyMember[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  /** User ids to hide (e.g. people already in the conversation). */
  exclude?: Set<string>;
}

const MemberMultiSelect = ({ members, selected, onChange, exclude }: MemberMultiSelectProps) => {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      if (exclude?.has(member.user_id)) return false;
      if (!q) return true;
      return (
        member.full_name.toLowerCase().includes(q) || (member.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [members, query, exclude]);

  const toggle = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange(next);
  };

  return (
    <div className={styles.wrapper}>
      <input
        type="search"
        className={styles.search}
        placeholder="Search teammates…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search teammates"
      />

      {visible.length === 0 ? (
        <p className={styles.empty}>No teammates match.</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((member) => (
            <li key={member.user_id}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={selected.has(member.user_id)}
                  onChange={() => toggle(member.user_id)}
                />
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{member.full_name}</span>
                  <span className={styles.optionMeta}>{member.job_title || member.email}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MemberMultiSelect;
