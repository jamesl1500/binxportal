/**
 * DeleteClientForm.tsx
 *
 * Client-side form for permanently deleting a client: typing its exact name
 * to confirm, same reasoning as DeleteAgencyForm — an agency could have many
 * clients, and typing the specific name guards against deleting the wrong
 * one. Submits via the `deleteClientAction` server action, which redirects
 * to /clients on success — there's no in-component success state to render.
 *
 * @module apps/binx-web/src/components/forms/clients/DeleteClientForm/DeleteClientForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { deleteClientAction } from "@/app/(app)/clients/actions";

import styles from "./DeleteClientForm.module.scss";

interface DeleteClientFormProps {
  agencyId: string;
  clientId: string;
  clientName: string;
}

const DeleteClientForm = ({ agencyId, clientId, clientName }: DeleteClientFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const deleteClientSchema = z
    .object({ confirmText: z.string() })
    .refine((values) => values.confirmText === clientName, {
      message: `Type "${clientName}" to confirm`,
      path: ["confirmText"],
    });

  type DeleteClientValues = z.infer<typeof deleteClientSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteClientValues>({
    resolver: zodResolver(deleteClientSchema),
    defaultValues: { confirmText: "" },
  });

  const onSubmit = () => {
    setFormError(null);

    startTransition(async () => {
      const result = await deleteClientAction(agencyId, clientId);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmText">
          Type <strong>{clientName}</strong> to confirm
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
        {isPending ? "Deleting…" : "Delete this client"}
      </button>
    </form>
  );
};

export default DeleteClientForm;
