/**
 * DeleteAgencyForm.tsx
 *
 * Client-side form for permanently deleting the current agency: typing its
 * exact name to confirm (rather than a generic word), since a user could
 * belong to several agencies and typing the specific name guards against
 * deleting the wrong one. Submits via the `deleteAgencyAction` server
 * action, which redirects on success — there's no in-component success
 * state to render.
 *
 * @module apps/binx-web/src/components/forms/agency/DeleteAgencyForm/DeleteAgencyForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { deleteAgencyAction } from "@/app/(app)/settings/actions";

import styles from "./DeleteAgencyForm.module.scss";

interface DeleteAgencyFormProps {
  agencyId: string;
  agencyName: string;
}

const DeleteAgencyForm = ({ agencyId, agencyName }: DeleteAgencyFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const deleteAgencySchema = z
    .object({ confirmText: z.string() })
    .refine((values) => values.confirmText === agencyName, {
      message: `Type "${agencyName}" to confirm`,
      path: ["confirmText"],
    });

  type DeleteAgencyValues = z.infer<typeof deleteAgencySchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteAgencyValues>({
    resolver: zodResolver(deleteAgencySchema),
    defaultValues: { confirmText: "" },
  });

  const onSubmit = () => {
    setFormError(null);

    startTransition(async () => {
      const result = await deleteAgencyAction(agencyId);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmText">
          Type <strong>{agencyName}</strong> to confirm
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
        {isPending ? "Deleting…" : "Delete this agency"}
      </button>
    </form>
  );
};

export default DeleteAgencyForm;
