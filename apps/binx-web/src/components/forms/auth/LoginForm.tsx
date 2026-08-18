/**
 * LoginForm.tsx
 *
 * Client-side login form: react-hook-form + zod for validation, zustand for
 * remembering the last-used email, and the `loginAction` server action for
 * the actual authentication call (see lib/auth.ts).
 *
 * @module apps/binx-web/src/components/forms/auth/LoginForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { loginAction } from "@/app/(auth)/auth/login/actions";
import { useLoginPreferencesStore } from "@/stores/use-login-preferences-store";

import styles from "./LoginForm.module.scss";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean(),
});

type LoginValues = z.infer<typeof loginSchema>;

const LoginForm = () => {
  const rememberedEmail = useLoginPreferencesStore((state) => state.rememberedEmail);
  const setRememberedEmail = useLoginPreferencesStore((state) => state.setRememberedEmail);

  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: rememberedEmail,
      password: "",
      rememberMe: Boolean(rememberedEmail),
    },
  });

  const onSubmit = (values: LoginValues) => {
    setFormError(null);
    setRememberedEmail(values.rememberMe ? values.email : null);

    startTransition(async () => {
      const result = await loginAction(values.email, values.password);
      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

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

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <a className={styles.forgotLink} href="/auth/forgot-password">
            Forgot password?
          </a>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={styles.input}
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
        {errors.password && <p className={styles.error}>{errors.password.message}</p>}
      </div>

      <label className={styles.checkboxRow}>
        <input type="checkbox" className={styles.checkbox} {...register("rememberMe")} />
        Remember me on this device
      </label>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
};

export default LoginForm;
