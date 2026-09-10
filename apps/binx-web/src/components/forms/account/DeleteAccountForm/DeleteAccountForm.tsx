/**
 * DeleteAccountForm.tsx
 *
 * Client-side form for permanently deleting the signed-in user's account:
 * current password + typing "DELETE" to confirm, via the `deleteAccountAction`
 * server action. On success the action clears the session and redirects to
 * login — there's no in-component success state to render.
 *
 * @module apps/binx-web/src/components/forms/account/DeleteAccountForm/DeleteAccountForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { deleteAccountAction } from "@/app/(app)/account/actions";

import styles from "./DeleteAccountForm.module.scss";

const deleteAccountSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    confirmText: z.string(),
  })
  .refine((values) => values.confirmText === "DELETE", {
    message: 'Type "DELETE" to confirm',
    path: ["confirmText"],
  });

type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;

const DeleteAccountForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeleteAccountValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { currentPassword: "", confirmText: "" },
  });

  const onSubmit = (values: DeleteAccountValues) => {
    setFormError(null);

    startTransition(async () => {
      const result = await deleteAccountAction(values.currentPassword);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="deleteCurrentPassword">
          Current password
        </label>
        <input
          id="deleteCurrentPassword"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          aria-invalid={Boolean(errors.currentPassword)}
          {...register("currentPassword")}
        />
        {errors.currentPassword && <p className={styles.error}>{errors.currentPassword.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmText">
          Type DELETE to confirm
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
        {isPending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
};

export default DeleteAccountForm;
