/**
 * AgencyGeneralForm.tsx
 *
 * Client-side form for renaming the current agency, via the
 * `updateAgencyAction` server action. The URL slug is shown read-only —
 * changing it isn't supported yet (see update_agency on the backend for why:
 * regenerating it would silently break any links built on it).
 *
 * @module apps/binx-web/src/components/forms/agency/AgencyGeneralForm/AgencyGeneralForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateAgencyAction } from "@/app/(app)/settings/actions";

import styles from "./AgencyGeneralForm.module.scss";

const agencyGeneralSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Must be at most 255 characters"),
});

type AgencyGeneralValues = z.infer<typeof agencyGeneralSchema>;

interface AgencyGeneralFormProps {
  agencyId: string;
  name: string;
  slug: string;
}

const AgencyGeneralForm = ({ agencyId, name, slug }: AgencyGeneralFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgencyGeneralValues>({
    resolver: zodResolver(agencyGeneralSchema),
    defaultValues: { name },
  });

  const onSubmit = (values: AgencyGeneralValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await updateAgencyAction(agencyId, values.name.trim());

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("Agency updated.");
        // The new name shows up elsewhere (org switcher, header) via server
        // data — refresh so those reflect it without a full navigation.
        router.refresh();
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
          className={styles.input}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && <p className={styles.error}>{errors.name.message}</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="slug">
          URL slug
        </label>
        <input id="slug" type="text" value={slug} readOnly disabled className={styles.input} />
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
};

export default AgencyGeneralForm;
