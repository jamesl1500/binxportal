/**
 * ProjectTeamSetup.tsx
 *
 * The "New project" wizard's team step: who's on the project and which of
 * the roles (chosen the step before) each person holds. The creator is
 * always first and can't be removed — binx-api adds them regardless — but
 * still needs a role like everyone else. Local state only, like
 * ProjectLabelSetup; the wizard sends it with the create request.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectTeamSetup/ProjectTeamSetup.tsx
 * @author Binx Portal
 */
"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import type { AgencyMember } from "@/lib/agencies";
import type { ProjectLabelDraft, ProjectSetupInput } from "@/lib/projects";

import styles from "./ProjectTeamSetup.module.scss";

export type TeamSeat = ProjectSetupInput["team"][number];

interface ProjectTeamSetupProps {
  agencyMembers: AgencyMember[];
  currentUserId: string;
  roles: ProjectLabelDraft[];
  team: TeamSeat[];
  onChange: (team: TeamSeat[]) => void;
  /** Highlight seats still missing a role (set once the user tries to continue). */
  showErrors?: boolean;
}

const ProjectTeamSetup = ({
  agencyMembers,
  currentUserId,
  roles,
  team,
  onChange,
  showErrors = false,
}: ProjectTeamSetupProps) => {
  const [selectedUserId, setSelectedUserId] = useState("");

  const membersById = useMemo(
    () => new Map(agencyMembers.map((member) => [member.user_id, member])),
    [agencyMembers],
  );
  const assignable = agencyMembers.filter(
    (member) => !team.some((seat) => seat.userId === member.user_id),
  );

  const setRole = (userId: string, roleName: string) =>
    onChange(
      team.map((seat) =>
        seat.userId === userId ? { ...seat, roleName: roleName || null } : seat,
      ),
    );

  const handleAdd = () => {
    if (!selectedUserId) return;
    onChange([...team, { userId: selectedUserId, roleName: null }]);
    setSelectedUserId("");
  };

  return (
    <div className={styles.wrapper}>
      <ul className={styles.list}>
        {team.map((seat) => {
          const member = membersById.get(seat.userId);
          const isYou = seat.userId === currentUserId;
          const name = member?.full_name ?? "Unknown teammate";
          const missingRole = showErrors && !seat.roleName;
          const selectId = `team-role-${seat.userId}`;
          return (
            <li key={seat.userId} className={styles.row}>
              <div className={styles.info}>
                <p className={styles.name}>
                  {name}
                  {isYou && <span className={styles.youBadge}>You</span>}
                </p>
                <p className={styles.meta}>
                  {member?.job_title || member?.email}
                </p>
              </div>
              <label className={styles.srOnly} htmlFor={selectId}>
                Role for {name}
              </label>
              <select
                id={selectId}
                className={styles.select}
                value={seat.roleName ?? ""}
                onChange={(event) => setRole(seat.userId, event.target.value)}
                aria-invalid={missingRole}
              >
                <option value="">Choose a role…</option>
                {roles.map((role) => (
                  <option key={role.name} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
              {isYou ? (
                <span className={styles.removePlaceholder} aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() =>
                    onChange(team.filter((item) => item.userId !== seat.userId))
                  }
                  aria-label={`Remove ${name} from the team`}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {assignable.length > 0 ? (
        <div className={styles.addRow}>
          <select
            className={styles.select}
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            aria-label="Add a teammate"
          >
            <option value="">Add a teammate…</option>
            {assignable.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAdd}
            disabled={!selectedUserId}
          >
            Add to team
          </button>
        </div>
      ) : (
        <p className={styles.hint}>
          Everyone at your agency is on this project.
        </p>
      )}
    </div>
  );
};

export default ProjectTeamSetup;
