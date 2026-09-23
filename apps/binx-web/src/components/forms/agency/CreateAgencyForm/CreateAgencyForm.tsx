/**
 * CreateAgencyForm.tsx
 *
 * Client-side form for creating a new agency from within the app (as
 * opposed to onboarding's AgencyForm, which creates the user's first one
 * and redirects afterward). Rendered on the dedicated `/agencies/new` page
 * via `NewAgencyForm` — this component owns validation/submission only;
 * where to navigate on success or cancel is reported upward via props
 * instead of handled here.
 *
 * @module apps/binx-web/src/components/forms/agency/CreateAgencyForm/CreateAgencyForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createAgencyAction } from "@/app/(app)/actions";
import type { AgencyRead } from "@/lib/agencies";

import styles from "./CreateAgencyForm.module.scss";

const agencySchema = z.object({
  name: z.string().trim().min(1, "Agency name is required").max(255, "Must be at most 255 characters"),
});

type AgencyValues = z.infer<typeof agencySchema>;

interface CreateAgencyFormProps {
  onCreated: (agency: AgencyRead) => void;
  onCancel: () => void;
}

const CreateAgencyForm = ({ onCreated, onCancel }: CreateAgencyFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgencyValues>({
    resolver: zodResolver(agencySchema),
    defaultValues: { name: "" },
  });

  const onSubmit = (values: AgencyValues) => {
    setFormError(null);

    startTransition(async () => {
      const result = await createAgencyAction(values.name);

      if (result.error || !result.agency) {
        setFormError(result.error ?? "Unable to create your agency");
        return;
      }

      onCreated(result.agency);
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="createAgencyName">
          Agency name
        </label>
        <input
          id="createAgencyName"
          type="text"
          autoComplete="organization"
          className={styles.input}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name ? (
          <p className={styles.error}>{errors.name.message}</p>
        ) : (
          <p className={styles.hint}>You can rename it later from Agency settings.</p>
        )}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={isPending}>
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create agency"}
        </button>
      </div>
    </form>
  );
};

export default CreateAgencyForm;
