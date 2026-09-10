/**
 * AgencyForm.tsx
 *
 * Client-side form for onboarding step two: react-hook-form + zod, and the
 * `createAgencyAction` server action to create the agency (see
 * app/(auth)/onboarding/two/actions.ts).
 *
 * @module apps/binx-web/src/components/forms/onboarding/AgencyForm/AgencyForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createAgencyAction } from "@/app/(auth)/onboarding/two/actions";

import styles from "./AgencyForm.module.scss";

const agencySchema = z.object({
  name: z.string().trim().min(1, "Agency name is required").max(255, "Must be at most 255 characters"),
});

type AgencyValues = z.infer<typeof agencySchema>;

const AgencyForm = () => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgencyValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = (values: AgencyValues) => {
    setFormError(null);

    startTransition(async () => {
      const result = await createAgencyAction(values.name);

      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">
          Agency name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="organization"
          className={styles.input}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && <p className={styles.error}>{errors.name.message}</p>}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Creating agency…" : "Create agency"}
      </button>
    </form>
  );
};

export default AgencyForm;
