/**
 * ProjectMembersPanel.tsx
 *
 * Who's assigned to a project: a list of current assignees (each removable)
 * plus a picker to assign another agency member. Only agency members can be
 * assigned — binx-api enforces this too, but the picker is pre-filtered to
 * the agency roster minus who's already on the project, so there's nothing
 * invalid to pick in the first place.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectMembersPanel/ProjectMembersPanel.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addProjectMemberAction, removeProjectMemberAction } from "@/app/(app)/projects/[projectId]/actions";
import type { AgencyMember } from "@/lib/agencies";
import type { ProjectMember } from "@/lib/projects";

import styles from "./ProjectMembersPanel.module.scss";

interface ProjectMembersPanelProps {
  agencyId: string;
  projectId: string;
  members: ProjectMember[];
  agencyMembers: AgencyMember[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const ProjectMembersPanel = ({ agencyId, projectId, members, agencyMembers }: ProjectMembersPanelProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const assignedUserIds = useMemo(() => new Set(members.map((member) => member.user_id)), [members]);
  const assignable = useMemo(
    () => agencyMembers.filter((member) => !assignedUserIds.has(member.user_id)),
    [agencyMembers, assignedUserIds],
  );

  const handleAdd = () => {
    if (!selectedUserId) return;
    setError(null);

    startTransition(async () => {
      const result = await addProjectMemberAction(agencyId, projectId, selectedUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedUserId("");
      router.refresh();
    });
  };

  const handleRemove = (memberId: string) => {
    setError(null);

    startTransition(async () => {
      const result = await removeProjectMemberAction(agencyId, projectId, memberId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      {members.length === 0 ? (
        <p className={styles.emptyText}>No one is assigned to this project yet.</p>
      ) : (
        <ul className={styles.list}>
          {members.map((member) => (
            <li key={member.id} className={styles.row}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(member.full_name)}
              </span>
              <div className={styles.info}>
                <p className={styles.name}>{member.full_name}</p>
                <p className={styles.meta}>{member.job_title || member.email}</p>
              </div>
              <button
                type="button"
                className={styles.remove}
                onClick={() => handleRemove(member.id)}
                disabled={isPending}
                aria-label={`Remove ${member.full_name} from the project`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

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

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default ProjectMembersPanel;
