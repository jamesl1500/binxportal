/**
 * ChangeEmailForm.tsx
 *
 * Client-side form for starting an email change: current password + new
 * address, via the `requestEmailChangeAction` server action. The address
 * doesn't change immediately — binx-api emails a confirmation link to the
 * new address first (see app/(auth)/auth/confirm-email).
 *
 * @module apps/binx-web/src/components/forms/account/ChangeEmailForm/ChangeEmailForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { requestEmailChangeAction } from "@/app/(app)/account/actions";

import styles from "./ChangeEmailForm.module.scss";

const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: z.email("Enter a valid email address"),
});

type ChangeEmailValues = z.infer<typeof changeEmailSchema>;

interface ChangeEmailFormProps {
  currentEmail: string;
}

const ChangeEmailForm = ({ currentEmail }: ChangeEmailFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { currentPassword: "", newEmail: "" },
  });

  const onSubmit = (values: ChangeEmailValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await requestEmailChangeAction(values);

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage(result.message ?? "Check your new inbox to confirm the change.");
        reset();
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="currentEmail">
          Current email
        </label>
        <input id="currentEmail" type="email" value={currentEmail} readOnly disabled className={styles.input} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="newEmail">
          New email
        </label>
        <input
          id="newEmail"
          type="email"
          autoComplete="email"
          className={styles.input}
          aria-invalid={Boolean(errors.newEmail)}
          {...register("newEmail")}
        />
        {errors.newEmail && <p className={styles.error}>{errors.newEmail.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          aria-invalid={Boolean(errors.currentPassword)}
          {...register("currentPassword")}
        />
        {errors.currentPassword && <p className={styles.error}>{errors.currentPassword.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Sending…" : "Change email"}
      </button>
    </form>
  );
};

export default ChangeEmailForm;
