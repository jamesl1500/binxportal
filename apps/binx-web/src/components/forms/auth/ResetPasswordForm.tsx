/**
 * ResetPasswordForm.tsx
 *
 * Client-side form for setting a new password from a reset-token link:
 * react-hook-form + zod for validation, `resetPasswordAction` server action
 * for the actual request (see lib/auth.ts).
 *
 * @module apps/binx-web/src/components/forms/auth/ResetPasswordForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { resetPasswordAction } from "@/app/(auth)/auth/reset-password/actions";

import styles from "./ResetPasswordForm.module.scss";

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordFormProps {
  token: string;
}

const ResetPasswordForm = ({ token }: ResetPasswordFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: ResetPasswordValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await resetPasswordAction(token, values.password);

      if (result?.error) {
        setFormError(result.error);
      }

      if (result?.message) {
        setSuccessMessage(result.message);
      }
    });
  };

  if (successMessage) {
    return <p className={styles.formSuccess}>{successMessage}</p>;
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className={styles.input}
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && <p className={styles.error}>{errors.password.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={styles.input}
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && <p className={styles.error}>{errors.confirmPassword.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
};

export default ResetPasswordForm;
