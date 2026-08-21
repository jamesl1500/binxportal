/**
 * ForgotPasswordForm.tsx
 *
 * Client-side form for requesting a password-reset email: react-hook-form +
 * zod for validation, `forgotPasswordAction` server action for the actual
 * request (see lib/auth.ts).
 *
 * @module apps/binx-web/src/components/forms/auth/ForgotPasswordForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { forgotPasswordAction } from "@/app/(auth)/auth/forgot-password/actions";

import styles from "./ForgotPasswordForm.module.scss";

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

const ForgotPasswordForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await forgotPasswordAction(values.email);

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
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={styles.input}
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
        {errors.email && <p className={styles.error}>{errors.email.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
};

export default ForgotPasswordForm;
