/**
 * SignupForm.tsx
 *
 * Client-side signup form: react-hook-form + zod for validation, and the
 * `signupAction` server action for account creation (see lib/auth.ts).
 * binx-api requires email verification, so on success this shows a
 * confirmation message instead of redirecting.
 *
 * @module apps/binx-web/src/components/forms/auth/SignupForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { signupAction } from "@/app/(auth)/auth/signup/actions";

import styles from "./SignupForm.module.scss";

const signupSchema = z
  .object({
    userName: z.string().min(3, "Must be at least 3 characters").max(255),
    fullName: z.string().min(1, "Full name is required"),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupValues = z.infer<typeof signupSchema>;

const SignupForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      userName: "",
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: SignupValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await signupAction(values.userName, values.email, values.fullName, values.password);

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
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className={styles.input}
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
          {errors.fullName && <p className={styles.error}>{errors.fullName.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="userName">
            Username
          </label>
          <input
            id="userName"
            type="text"
            autoComplete="username"
            className={styles.input}
            aria-invalid={Boolean(errors.userName)}
            {...register("userName")}
          />
          {errors.userName && <p className={styles.error}>{errors.userName.message}</p>}
        </div>
      </div>

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

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Password
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
          Confirm password
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
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
};

export default SignupForm;
