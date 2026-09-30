/**
 * NewProjectForm.tsx
 *
 * The multi-step "New project" wizard on `/projects/new`:
 *
 *   1. Details  — the shared ProjectForm (create mode only validates)
 *   2. Task tags — at least one, so the board can be categorised from day one
 *   3. Roles     — at least one member role
 *   4. Team      — who's on it, each with one of those roles (the creator too)
 *   5. Review    — then one create request carrying all of the above, so the
 *                  project is never left half set up
 *
 * After creating, the AI starter-task offer (AiTaskSetup) runs before landing
 * on the new project's page. Every step keeps its state while you move back
 * and forth; nothing is saved until "Create project".
 *
 * @module apps/binx-web/src/components/forms/projects/NewProjectForm/NewProjectForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { createProjectAction } from "@/app/(app)/projects/actions";
import AiTaskSetup from "@/components/projects/AiTaskSetup/AiTaskSetup";
import ProjectForm from "@/components/forms/projects/ProjectForm/ProjectForm";
import ProjectLabelSetup from "@/components/forms/projects/ProjectLabelSetup/ProjectLabelSetup";
import ProjectTeamSetup, { type TeamSeat } from "@/components/forms/projects/ProjectTeamSetup/ProjectTeamSetup";
import type { AgencyMember } from "@/lib/agencies";
import type { AgencyClient } from "@/lib/clients";
import { PROJECT_STATUS_LABELS } from "@/lib/projects-client";
import type { Project, ProjectDetailsInput, ProjectLabelDraft } from "@/lib/projects";

import styles from "./NewProjectForm.module.scss";

export const TAG_SUGGESTIONS: ProjectLabelDraft[] = [
  { name: "Feature", color: "#2563eb" },
  { name: "Bug", color: "#dc2626" },
  { name: "Design", color: "#7c3aed" },
  { name: "Content", color: "#ca8a04" },
  { name: "Urgent", color: "#ea580c" },
  { name: "Client feedback", color: "#0891b2" },
  { name: "Blocked", color: "#6e6e76" },
];

export const ROLE_SUGGESTIONS: ProjectLabelDraft[] = [
  { name: "Project Manager", color: "#2563eb" },
  { name: "Designer", color: "#7c3aed" },
  { name: "Developer", color: "#16a34a" },
  { name: "Copywriter", color: "#ca8a04" },
  { name: "QA", color: "#ea580c" },
  { name: "Account Manager", color: "#0891b2" },
  { name: "Strategist", color: "#db2777" },
];

// Pre-selected so the common case is a couple of clicks — still editable, and
// still required: removing them all blocks Continue.
const DEFAULT_TAGS = TAG_SUGGESTIONS.filter((tag) => ["Feature", "Bug", "Design", "Urgent"].includes(tag.name));
const DEFAULT_ROLES = ROLE_SUGGESTIONS.filter((role) => ["Project Manager", "Designer", "Developer"].includes(role.name));

const STEPS = [
  { id: "details", label: "Details" },
  { id: "tags", label: "Task tags" },
  { id: "roles", label: "Roles" },
  { id: "team", label: "Team" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

interface NewProjectFormProps {
  agencyId: string;
  clients: AgencyClient[];
  agencyMembers: AgencyMember[];
  currentUserId: string;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

const LabelChips = ({ labels }: { labels: ProjectLabelDraft[] }) => (
  <ul className={styles.chips}>
    {labels.map((label) => (
      <li key={label.name} className={styles.chip} style={{ borderColor: label.color, color: label.color }}>
        {label.name}
      </li>
    ))}
  </ul>
);

const NewProjectForm = ({ agencyId, clients, agencyMembers, currentUserId }: NewProjectFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<StepId>("details");
  const [furthest, setFurthest] = useState(0);
  const [details, setDetails] = useState<ProjectDetailsInput | null>(null);
  const [tags, setTags] = useState<ProjectLabelDraft[]>(DEFAULT_TAGS);
  const [roles, setRoles] = useState<ProjectLabelDraft[]>(DEFAULT_ROLES);
  const [team, setTeam] = useState<TeamSeat[]>([{ userId: currentUserId, roleName: "Project Manager" }]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [showTeamErrors, setShowTeamErrors] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  // Why `id` can't be left yet, or null if it's complete.
  const validate = (id: StepId): string | null => {
    if (id === "details" && details === null) return "Fill in the project details first.";
    if (id === "tags" && tags.length === 0) {
      return "Add at least one task tag — the team uses them to sort work on the board.";
    }
    if (id === "roles" && roles.length === 0) return "Add at least one member role.";
    if (id === "team" && team.some((seat) => !seat.roleName)) return "Give everyone on the team a role.";
    return null;
  };

  // Moving forward (Continue, a stepper jump, or Create) re-checks every step
  // in between, so emptying an earlier step and jumping ahead can't skip it.
  const goTo = (next: StepId, { validated = false } = {}): boolean => {
    const index = STEPS.findIndex((item) => item.id === next);
    for (const item of validated ? [] : STEPS.slice(0, index)) {
      const error = validate(item.id);
      if (error) {
        setStep(item.id);
        setStepError(error);
        if (item.id === "team") setShowTeamErrors(true);
        return false;
      }
    }
    setStepError(null);
    setStep(next);
    setFurthest((value) => Math.max(value, index));
    return true;
  };

  // Roles drive the team's role pickers — dropping a role clears it from
  // anyone who held it, so the team step flags them instead of sending a
  // name binx-api would reject.
  const updateRoles = (next: ProjectLabelDraft[]) => {
    setRoles(next);
    const names = new Set(next.map((role) => role.name));
    setTeam((seats) =>
      seats.map((seat) => (seat.roleName && !names.has(seat.roleName) ? { ...seat, roleName: null } : seat)),
    );
  };

  const continueFrom = (current: StepId) => {
    goTo(STEPS[STEPS.findIndex((item) => item.id === current) + 1].id);
  };

  const handleCreate = () => {
    if (!goTo("review") || !details) return;
    setCreateError(null);
    startTransition(async () => {
      const result = await createProjectAction(agencyId, details, { tags, roles, team });
      if (result.error || !result.project) {
        setCreateError(result.error ?? "Unable to create project");
        return;
      }
      setCreatedProject(result.project);
    });
  };

  if (createdProject) {
    return (
      <>
        <h2 className={styles.stepTitle}>{createdProject.name} is ready</h2>
        <p className={styles.stepSubtitle}>
          Tags, roles, and the team are set up. Want a head start on the board too? You can always add lists and tasks
          by hand later.
        </p>
        <AiTaskSetup
          agencyId={agencyId}
          projectId={createdProject.id}
          onDone={() => router.push(`/projects/${createdProject.id}`)}
        />
      </>
    );
  }

  const clientName = clients.find((client) => client.id === details?.clientId)?.name ?? "—";
  const memberName = (userId: string) =>
    agencyMembers.find((member) => member.user_id === userId)?.full_name ?? "Unknown teammate";

  const footer = (current: StepId) => (
    <div className={styles.footer}>
      <button type="button" className={styles.back} onClick={() => goTo(STEPS[stepIndex - 1].id)}>
        Back
      </button>
      <button type="button" className={styles.next} onClick={() => continueFrom(current)}>
        Continue
      </button>
    </div>
  );

  return (
    <div className={styles.wizard}>
      <ol className={styles.stepper}>
        {STEPS.map((item, index) => {
          const state = index === stepIndex ? "current" : index < stepIndex ? "done" : "upcoming";
          return (
            <li key={item.id} className={styles.stepperItem} data-state={state}>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => goTo(item.id)}
                // Jump back freely, or forward only to steps already reached
                // (and so already validated) — never skip ahead.
                disabled={index > furthest || index === stepIndex}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className={styles.stepNumber}>
                  {state === "done" ? <Check aria-hidden="true" /> : index + 1}
                </span>
                <span className={styles.stepLabel}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <section>
          <h2 className={styles.stepTitle}>Project details</h2>
          <p className={styles.stepSubtitle}>
            Every project starts with a To Do, In Progress, and Done list — you can add more once it&apos;s created.
          </p>
          <ProjectForm
            agencyId={agencyId}
            clients={clients}
            initialValues={details ?? undefined}
            onContinue={(input) => {
              setDetails(input);
              // `details` in this render is still the old value, and the
              // later steps were checked when they were last left.
              goTo(furthest > 1 ? STEPS[furthest].id : "tags", { validated: true });
            }}
            onCancel={() => router.push("/projects")}
          />
        </section>
      )}

      {step === "tags" && (
        <section>
          <h2 className={styles.stepTitle}>Task tags</h2>
          <p className={styles.stepSubtitle}>
            Tags categorise cards on the board (“Bug”, “Design”, “Urgent”…). Pick at least one so the team can sort work
            from day one.
          </p>
          <ProjectLabelSetup
            noun="tag"
            suggestions={TAG_SUGGESTIONS}
            labels={tags}
            onChange={(next) => {
              setTags(next);
              setStepError(null);
            }}
            maxLength={50}
            placeholder='e.g. "Copy review"'
          />
          {stepError && <p className={styles.stepError} role="alert">{stepError}</p>}
          {footer("tags")}
        </section>
      )}

      {step === "roles" && (
        <section>
          <h2 className={styles.stepTitle}>Member roles</h2>
          <p className={styles.stepSubtitle}>
            Roles say who does what on this project. They&apos;re labels only — permissions still come from each
            person&apos;s agency role.
          </p>
          <ProjectLabelSetup
            noun="role"
            suggestions={ROLE_SUGGESTIONS}
            labels={roles}
            onChange={(next) => {
              updateRoles(next);
              setStepError(null);
            }}
            maxLength={100}
            placeholder='e.g. "Web Developer"'
          />
          {stepError && <p className={styles.stepError} role="alert">{stepError}</p>}
          {footer("roles")}
        </section>
      )}

      {step === "team" && (
        <section>
          <h2 className={styles.stepTitle}>Team</h2>
          <p className={styles.stepSubtitle}>
            Add the people working on this project and give each of them a role. They&apos;ll be notified once
            it&apos;s created.
          </p>
          <ProjectTeamSetup
            agencyMembers={agencyMembers}
            currentUserId={currentUserId}
            roles={roles}
            team={team}
            onChange={(next) => {
              setTeam(next);
              setStepError(null);
            }}
            showErrors={showTeamErrors}
          />
          {stepError && <p className={styles.stepError} role="alert">{stepError}</p>}
          {footer("team")}
        </section>
      )}

      {step === "review" && details && (
        <section>
          <h2 className={styles.stepTitle}>Review</h2>
          <p className={styles.stepSubtitle}>Everything below is created together. You can change any of it later.</p>

          <dl className={styles.review}>
            <div className={styles.reviewRow}>
              <dt>Project</dt>
              <dd>
                <strong>{details.name}</strong> for {clientName} · {PROJECT_STATUS_LABELS[details.status]}
                <br />
                {details.startDate || details.dueDate
                  ? `${formatDate(details.startDate)} → ${formatDate(details.dueDate)}`
                  : "No dates set"}
              </dd>
              <button type="button" className={styles.edit} onClick={() => goTo("details")}>
                Edit
              </button>
            </div>
            <div className={styles.reviewRow}>
              <dt>Task tags</dt>
              <dd>
                <LabelChips labels={tags} />
              </dd>
              <button type="button" className={styles.edit} onClick={() => goTo("tags")}>
                Edit
              </button>
            </div>
            <div className={styles.reviewRow}>
              <dt>Roles</dt>
              <dd>
                <LabelChips labels={roles} />
              </dd>
              <button type="button" className={styles.edit} onClick={() => goTo("roles")}>
                Edit
              </button>
            </div>
            <div className={styles.reviewRow}>
              <dt>Team</dt>
              <dd>
                <ul className={styles.teamList}>
                  {team.map((seat) => (
                    <li key={seat.userId}>
                      {memberName(seat.userId)}
                      {seat.userId === currentUserId && " (you)"} — {seat.roleName}
                    </li>
                  ))}
                </ul>
              </dd>
              <button type="button" className={styles.edit} onClick={() => goTo("team")}>
                Edit
              </button>
            </div>
          </dl>

          {createError && <p className={styles.stepError} role="alert">{createError}</p>}

          <div className={styles.footer}>
            <button type="button" className={styles.back} onClick={() => goTo("team")} disabled={isPending}>
              Back
            </button>
            <button type="button" className={styles.next} onClick={handleCreate} disabled={isPending}>
              {isPending ? "Creating…" : "Create project"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default NewProjectForm;
