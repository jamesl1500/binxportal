/**
 * EditProfileForm.tsx
 *
 * Client-side form for editing the signed-in user's profile: name, job
 * title, phone number, and a short bio. Email and username are shown
 * read-only — changing either isn't supported yet (email would need a
 * re-verification flow; username is the account's stable identifier).
 * Saves via the `updateProfileAction` server action.
 *
 * @module apps/binx-web/src/components/forms/account/EditProfileForm/EditProfileForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateProfileAction } from "@/app/(app)/profile/actions";
import type { CurrentUser } from "@/lib/auth";

import styles from "./EditProfileForm.module.scss";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(255, "Must be at most 255 characters"),
  jobTitle: z.string().trim().max(255, "Must be at most 255 characters").optional(),
  phoneNumber: z.string().trim().max(32, "Must be at most 32 characters").optional(),
  summary: z.string().trim().max(1024, "Must be at most 1024 characters").optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

interface EditProfileFormProps {
  user: CurrentUser;
}

const EditProfileForm = ({ user }: EditProfileFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user.full_name,
      jobTitle: user.job_title ?? "",
      phoneNumber: user.phone_number ?? "",
      summary: user.summary ?? "",
    },
  });

  const onSubmit = (values: ProfileValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await updateProfileAction({
        fullName: values.fullName.trim(),
        jobTitle: values.jobTitle?.trim() || null,
        phoneNumber: values.phoneNumber?.trim() || null,
        summary: values.summary?.trim() || null,
      });

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("Profile updated.");
      }
    });
  };

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
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input id="email" type="email" value={user.email} readOnly disabled className={styles.input} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="userName">
            Username
          </label>
          <input id="userName" type="text" value={user.user_name} readOnly disabled className={styles.input} />
        </div>
      </div>

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
        <label className={styles.label} htmlFor="summary">
          Bio
        </label>
        <textarea
          id="summary"
          rows={4}
          className={styles.textarea}
          aria-invalid={Boolean(errors.summary)}
          {...register("summary")}
        />
        {errors.summary && <p className={styles.error}>{errors.summary.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
};

export default EditProfileForm;
