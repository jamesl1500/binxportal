/**
 * ProfileForm.tsx
 *
 * Client-side form for onboarding step one: react-hook-form + zod, and the
 * `updateProfileAction` server action to save the details (see
 * app/(auth)/onboarding/one/actions.ts). Both fields are optional.
 *
 * @module apps/binx-web/src/components/forms/onboarding/ProfileForm/ProfileForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateProfileAction } from "@/app/(auth)/onboarding/one/actions";

import styles from "./ProfileForm.module.scss";

const profileSchema = z.object({
  phoneNumber: z.string().trim().max(32, "Must be at most 32 characters").optional(),
  jobTitle: z.string().trim().max(255, "Must be at most 255 characters").optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

const ProfileForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phoneNumber: "",
      jobTitle: "",
    },
  });

  const onSubmit = (values: ProfileValues) => {
    setFormError(null);

    startTransition(async () => {
      // Blank inputs come back as "" from react-hook-form; normalize to null
      // so the backend leaves the field untouched instead of clearing it.
      const result = await updateProfileAction(values.phoneNumber?.trim() || null, values.jobTitle?.trim() || null);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="phoneNumber">
          Phone number
        </label>
        <input
          id="phoneNumber"
          type="tel"
          autoComplete="tel"
          className={styles.input}
          aria-invalid={Boolean(errors.phoneNumber)}
          {...register("phoneNumber")}
        />
        {errors.phoneNumber && <p className={styles.error}>{errors.phoneNumber.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="jobTitle">
          Job title
        </label>
        <input
          id="jobTitle"
          type="text"
          autoComplete="organization-title"
          className={styles.input}
          aria-invalid={Boolean(errors.jobTitle)}
          {...register("jobTitle")}
        />
        {errors.jobTitle && <p className={styles.error}>{errors.jobTitle.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
};

export default ProfileForm;
