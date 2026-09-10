/**
 * ProjectForm.tsx
 *
 * Shared create/edit form for a project: name, client, status, description,
 * and optional start/due dates. Create and edit only differ in default
 * values and which server action they call — sharing one component keeps
 * the two in sync as fields are added. Used inside CreateProjectDialog's
 * modal (create) and directly on the project dashboard (edit) — the caller
 * owns any surrounding chrome, this only owns the fields and submission.
 *
 * @module apps/binx-web/src/components/forms/projects/ProjectForm/ProjectForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createProjectAction } from "@/app/(app)/projects/actions";
import { updateProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import type { AgencyClient } from "@/lib/clients";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/lib/projects-client";
import type { Project } from "@/lib/projects";

import styles from "./ProjectForm.module.scss";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(255, "Must be at most 255 characters"),
  clientId: z.string().min(1, "Choose a client"),
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  description: z.string().trim().max(4096, "Must be at most 4096 characters").optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

type ProjectValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  agencyId: string;
  clients: AgencyClient[];
  /** Omit for create mode; pass the project being edited for edit mode. */
  project?: Project;
  /**
   * Called after a successful save. Optional — edit mode already shows its
   * own inline success message and refreshes the route itself; callers only
   * need this to react further, e.g. CreateProjectDialog closing itself.
   */
  onSuccess?: (project: Project) => void;
  onCancel?: () => void;
}

const ProjectForm = ({ agencyId, clients, project, onSuccess, onCancel }: ProjectFormProps) => {
  const isEdit = Boolean(project);
  const router = useRouter();
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
      name: project?.name ?? "",
      clientId: project?.client_id ?? clients[0]?.id ?? "",
      status: project?.status ?? "planning",
      description: project?.description ?? "",
      startDate: project?.start_date ?? "",
      dueDate: project?.due_date ?? "",
    },
  });

  const onSubmit = (values: ProjectValues) => {
    setFormError(null);
    setSuccessMessage(null);

    const input = {
      name: values.name.trim(),
      clientId: values.clientId,
      status: values.status as Project["status"],
      description: values.description?.trim() || null,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
    };

    startTransition(async () => {
      const result = project
        ? await updateProjectAction(agencyId, project.id, input)
        : await createProjectAction(agencyId, input);

      if (result.error || !result.project) {
        setFormError(result.error ?? "Unable to save project");
        return;
      }

      if (isEdit) {
        setSuccessMessage("Project updated.");
        router.refresh();
      }
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
            {clients.length === 0 && <option value="">Add a client first</option>}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.clientId && <p className={styles.error}>{errors.clientId.message}</p>}
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
          <input id="startDate" type="date" className={styles.input} {...register("startDate")} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="dueDate">
            Due date
          </label>
          <input id="dueDate" type="date" className={styles.input} {...register("dueDate")} />
        </div>
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
        {errors.description && <p className={styles.error}>{errors.description.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={isPending || clients.length === 0}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;
