/**
 * AgencySubdomainForm.tsx
 *
 * Lets a Starter+ agency claim a custom subdomain (e.g. "foundryframe" for
 * foundryframe.binxportal.com) via the `updateAgencySubdomainAction` server
 * action. Format/reserved-word/uniqueness checks happen server-side
 * (agencies/service.py::validate_subdomain) — this mirrors the same shape
 * client-side only so a bad value never round-trips for nothing.
 *
 * @module apps/binx-web/src/components/forms/agency/AgencySubdomainForm/AgencySubdomainForm.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { updateAgencySubdomainAction } from "@/app/(app)/settings/actions";
import { ROOT_DOMAIN } from "@/lib/site";

import styles from "./AgencySubdomainForm.module.scss";

const subdomainSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Must be at least 3 characters")
    .max(63, "Must be at most 63 characters")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "Lowercase letters, numbers, and hyphens only — can't start or end with a hyphen",
    )
    .or(z.literal("")),
});

type SubdomainValues = z.infer<typeof subdomainSchema>;

interface AgencySubdomainFormProps {
  agencyId: string;
  subdomain: string | null;
  /** Whether the agency's current plan is Starter or above. */
  canUseSubdomain: boolean;
}

const AgencySubdomainForm = ({
  agencyId,
  subdomain,
  canUseSubdomain,
}: AgencySubdomainFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubdomainValues>({
    resolver: zodResolver(subdomainSchema),
    defaultValues: { subdomain: subdomain ?? "" },
  });

  const onSubmit = (values: SubdomainValues) => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await updateAgencySubdomainAction(
        agencyId,
        values.subdomain === "" ? null : values.subdomain,
      );

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage(
          values.subdomain === "" ? "Subdomain removed." : "Subdomain updated.",
        );
      }
    });
  };

  if (!canUseSubdomain) {
    return (
      <div className={styles.locked}>
        <p className={styles.lockedText}>
          Custom subdomains (e.g. <strong>youragency.{ROOT_DOMAIN}</strong>)
          are available on the Starter plan and above.
          {subdomain
            ? ` Yours (${subdomain}.${ROOT_DOMAIN}) is reserved but not currently serving — upgrade to turn it back on.`
            : ""}
        </p>
        <a className={styles.upgradeLink} href="/settings/plan">
          Upgrade in Settings → Plan
        </a>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="subdomain">
          Subdomain
        </label>
        <div className={styles.inputRow}>
          <input
            id="subdomain"
            type="text"
            placeholder="youragency"
            className={styles.input}
            aria-invalid={Boolean(errors.subdomain)}
            {...register("subdomain")}
          />
          <span className={styles.suffix}>.{ROOT_DOMAIN}</span>
        </div>
        {errors.subdomain && (
          <p className={styles.error}>{errors.subdomain.message}</p>
        )}
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
};

export default AgencySubdomainForm;
