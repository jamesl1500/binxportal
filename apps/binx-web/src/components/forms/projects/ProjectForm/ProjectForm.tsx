/**
 * ProjectForm.tsx
 *
 * Shared create/edit form for a project's details: name, client, status,
 * description, dates, and default rate. Sharing one component keeps the two
 * in sync as fields are added. In edit mode (`project` given, project
 * Settings) it saves via `updateProjectAction`. In create mode it's the first
 * step of the NewProjectForm wizard: it only validates and hands the values
 * to `onContinue` — nothing is created until the wizard's final step, so a
 * project never exists without its tags, roles, and team.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectForm/ProjectForm.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import type { AgencyClient } from "@/lib/clients";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/lib/projects-client";
import type { Project, ProjectDetailsInput } from "@/lib/projects";

import styles from "./ProjectForm.module.scss";

const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(255, "Must be at most 255 characters"),
  clientId: z.string().min(1, "Choose a client"),
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  description: z
    .string()
    .trim()
    .max(4096, "Must be at most 4096 characters")
    .optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  defaultHourlyRate: z.string().optional(),
});

function toCents(dollars: string): number | null {
  const n = Number.parseFloat(dollars);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

type ProjectValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  agencyId: string;
  clients: AgencyClient[];
  /** Pass the project being edited for edit mode; omit for create mode. */
  project?: Project;
  /** Edit mode: called after a successful save (the form already shows its own success message). */
  onSuccess?: (project: Project) => void;
  /** Create mode: called with the validated details — the caller decides when to actually create. */
  onContinue?: (input: ProjectDetailsInput) => void;
  /**
   * Create mode: values to restore, e.g. when the wizard steps back to this
   * form, or to preselect a client coming from that client's own page.
   */
  initialValues?: Partial<ProjectDetailsInput>;
  onCancel?: () => void;
}

const ProjectForm = ({
  agencyId,
  clients,
  project,
  onSuccess,
  onContinue,
  initialValues,
  onCancel,
}: ProjectFormProps) => {
  const isEdit = Boolean(project);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? initialValues?.name ?? "",
      clientId:
        project?.client_id ?? initialValues?.clientId ?? clients[0]?.id ?? "",
      status: project?.status ?? initialValues?.status ?? "planning",
      description: project?.description ?? initialValues?.description ?? "",
      startDate: project?.start_date ?? initialValues?.startDate ?? "",
      dueDate: project?.due_date ?? initialValues?.dueDate ?? "",
      defaultHourlyRate: centsToInput(
        project?.default_hourly_rate_cents ??
          initialValues?.defaultHourlyRateCents ??
          null,
      ),
    },
  });

  const onSubmit = (values: ProjectValues) => {
    setFormError(null);
    setSuccessMessage(null);

    const input: ProjectDetailsInput = {
      name: values.name.trim(),
      clientId: values.clientId,
      status: values.status as Project["status"],
      description: values.description?.trim() || null,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
      defaultHourlyRateCents: values.defaultHourlyRate
        ? toCents(values.defaultHourlyRate)
        : null,
    };

    if (!project) {
      onContinue?.(input);
      return;
    }

    startTransition(async () => {
      const result = await updateProjectAction(agencyId, project.id, input);

      if (result.error || !result.project) {
        setFormError(result.error ?? "Unable to save project");
        return;
      }

      setSuccessMessage("Project updated.");
      onSuccess?.(result.project);
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="projectName">
          Project name
        </label>
        <input
          id="projectName"
          type="text"
          className={styles.input}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && <p className={styles.error}>{errors.name.message}</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="clientId">
            Client
          </label>
          <select
            id="clientId"
            className={styles.select}
            aria-invalid={Boolean(errors.clientId)}
            {...register("clientId")}
          >
            {clients.length === 0 && (
              <option value="">Add a client first</option>
            )}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.clientId && (
            <p className={styles.error}>{errors.clientId.message}</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="status">
            Status
          </label>
          <select id="status" className={styles.select} {...register("status")}>
            {PROJECT_STATUSES.map((statusOption) => (
              <option key={statusOption} value={statusOption}>
                {PROJECT_STATUS_LABELS[statusOption]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="startDate">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            className={styles.input}
            {...register("startDate")}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            className={styles.input}
            {...register("dueDate")}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="defaultHourlyRate">
          Default hourly rate
        </label>
        <input
          id="defaultHourlyRate"
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 150.00"
          className={styles.input}
          {...register("defaultHourlyRate")}
        />
        <p className={styles.hint}>
          Used to bill time entries on this project when no rate is set on the
          entry itself.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          className={styles.textarea}
          aria-invalid={Boolean(errors.description)}
          {...register("description")}
        />
        {errors.description && (
          <p className={styles.error}>{errors.description.message}</p>
        )}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button
            type="button"
            className={styles.cancel}
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className={styles.submit}
          disabled={isPending || clients.length === 0}
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Continue"}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;
