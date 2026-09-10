/**
 * DeleteProjectForm.tsx
 *
 * Client-side form for permanently deleting a project: typing its exact name
 * to confirm, same reasoning as DeleteClientForm — an agency could have many
 * projects, and typing the specific name guards against deleting the wrong
 * one. Submits via the `deleteProjectAction` server action, which redirects
 * to /projects on success — there's no in-component success state to render.
 *
 * @module apps/binx-web/src/components/forms/projects/DeleteProjectForm/DeleteProjectForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { deleteProjectAction } from "@/app/(app)/projects/[projectId]/actions";

import styles from "./DeleteProjectForm.module.scss";

interface DeleteProjectFormProps {
  agencyId: string;
  projectId: string;
  projectName: string;
}

const DeleteProjectForm = ({ agencyId, projectId, projectName }: DeleteProjectFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const deleteProjectSchema = z
    .object({ confirmText: z.string() })
    .refine((values) => values.confirmText === projectName, {
      message: `Type "${projectName}" to confirm`,
      path: ["confirmText"],
    });

  type DeleteProjectValues = z.infer<typeof deleteProjectSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteProjectValues>({
    resolver: zodResolver(deleteProjectSchema),
    defaultValues: { confirmText: "" },
  });

  const onSubmit = () => {
    setFormError(null);

    startTransition(async () => {
      const result = await deleteProjectAction(agencyId, projectId);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmText">
          Type <strong>{projectName}</strong> to confirm
        </label>
        <input
          id="confirmText"
          type="text"
          autoComplete="off"
          className={styles.input}
          aria-invalid={Boolean(errors.confirmText)}
          {...register("confirmText")}
        />
        {errors.confirmText && <p className={styles.error}>{errors.confirmText.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Deleting…" : "Delete this project"}
      </button>
    </form>
  );
};

export default DeleteProjectForm;
