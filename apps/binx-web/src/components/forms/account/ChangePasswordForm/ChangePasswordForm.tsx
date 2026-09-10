/**
 * ChangePasswordForm.tsx
 *
 * Client-side form for changing the signed-in user's password: current
 * password (as proof of ownership) + a new one, confirmed twice, via the
 * `changePasswordAction` server action.
 *
 * @module apps/binx-web/src/components/forms/account/ChangePasswordForm/ChangePasswordForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { changePasswordAction } from "@/app/(app)/account/actions";

import styles from "./ChangePasswordForm.module.scss";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

const ChangePasswordForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const onSubmit = (values: ChangePasswordValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("Password updated.");
        reset();
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          className={styles.input}
          aria-invalid={Boolean(errors.newPassword)}
          {...register("newPassword")}
        />
        {errors.newPassword && <p className={styles.error}>{errors.newPassword.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmNewPassword">
          Confirm new password
        </label>
        <input
          id="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          className={styles.input}
          aria-invalid={Boolean(errors.confirmNewPassword)}
          {...register("confirmNewPassword")}
        />
        {errors.confirmNewPassword && <p className={styles.error}>{errors.confirmNewPassword.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
};

export default ChangePasswordForm;
