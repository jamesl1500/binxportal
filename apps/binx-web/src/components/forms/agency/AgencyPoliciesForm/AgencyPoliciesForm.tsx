/**
 * AgencyPoliciesForm.tsx
 *
 * The four named policy blocks — terms of service, privacy policy, working /
 * client policy, cancellation policy. Each optional, plain text. Saves the
 * whole set through `updateAgencyProfileAction`.
 *
 * @module apps/binx-web/src/components/forms/agency/AgencyPoliciesForm/AgencyPoliciesForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AgencyProfile } from "@/lib/agencies";
import { updateAgencyProfileAction } from "@/app/(app)/settings/actions";

import styles from "./AgencyPoliciesForm.module.scss";

interface AgencyPoliciesFormProps {
  agencyId: string;
  profile: AgencyProfile;
}

const BLOCKS = [
  { key: "terms_of_service", label: "Terms of service" },
  { key: "privacy_policy", label: "Privacy policy" },
  { key: "working_policy", label: "Working / client policy" },
  { key: "cancellation_policy", label: "Cancellation policy" },
] as const;

const AgencyPoliciesForm = ({ agencyId, profile }: AgencyPoliciesFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(BLOCKS.map((block) => [block.key, profile[block.key] ?? ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAgencyProfileAction(
        agencyId,
        Object.fromEntries(BLOCKS.map((block) => [block.key, values[block.key].trim() || null])),
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {BLOCKS.map((block) => (
        <div key={block.key} className={styles.field}>
          <label className={styles.label} htmlFor={block.key}>
            {block.label}
          </label>
          <textarea
            id={block.key}
            className={styles.textarea}
            rows={6}
            maxLength={16384}
            value={values[block.key]}
            onChange={(event) => setValues((prev) => ({ ...prev, [block.key]: event.target.value }))}
          />
        </div>
      ))}

      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.success}>Policies saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save policies"}
      </button>
    </form>
  );
};

export default AgencyPoliciesForm;
