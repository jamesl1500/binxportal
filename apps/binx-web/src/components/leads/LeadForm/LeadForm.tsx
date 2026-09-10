/**
 * LeadForm.tsx
 *
 * Shared create/edit form for a lead — mirrors `forms/clients/ClientForm`.
 * Name plus optional contact details, website, source, estimated value, and
 * notes. Create and edit differ only in defaults and which action they call.
 *
 * @module apps/binx-web/src/components/leads/LeadForm/LeadForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createLeadAction, updateLeadAction } from "@/app/(app)/leads/actions";
import type { Lead } from "@/lib/leads";
import { LEAD_SOURCE_LABELS, type LeadSource } from "@/lib/leads-client";

import styles from "./LeadForm.module.scss";

const SOURCES = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];

const leadSchema = z.object({
  name: z.string().trim().min(1, "A name is required").max(255, "Too long"),
  contactName: z.string().trim().max(255, "Too long").optional(),
  contactEmail: z.email("Enter a valid email").optional().or(z.literal("")),
  contactPhone: z.string().trim().max(32, "Too long").optional(),
  website: z.string().trim().max(2048, "Too long").optional(),
  source: z.enum(["manual", "referral", "inbound", "import", "ai_generated"]),
  estimatedValue: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter a number"),
  notes: z.string().trim().max(8192, "Too long").optional(),
});

type LeadValues = z.infer<typeof leadSchema>;

interface LeadFormProps {
  agencyId: string;
  lead?: Lead;
  onSuccess?: (lead: Lead) => void;
  onCancel?: () => void;
}

const LeadForm = ({ agencyId, lead, onSuccess, onCancel }: LeadFormProps) => {
  const isEdit = Boolean(lead);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: lead?.name ?? "",
      contactName: lead?.contact_name ?? "",
      contactEmail: lead?.contact_email ?? "",
      contactPhone: lead?.contact_phone ?? "",
      website: lead?.website ?? "",
      source: lead?.source ?? "manual",
      estimatedValue:
        lead?.estimated_value_cents != null ? String(lead.estimated_value_cents / 100) : "",
      notes: lead?.notes ?? "",
    },
  });

  const onSubmit = (values: LeadValues) => {
    setFormError(null);
    setSuccessMessage(null);
    const input = {
      name: values.name.trim(),
      contactName: values.contactName?.trim() || null,
      contactEmail: values.contactEmail?.trim() || null,
      contactPhone: values.contactPhone?.trim() || null,
      website: values.website?.trim() || null,
      source: values.source,
      estimatedValueCents: values.estimatedValue ? Math.round(Number(values.estimatedValue) * 100) : null,
      notes: values.notes?.trim() || null,
    };

    startTransition(async () => {
      const result = lead
        ? await updateLeadAction(agencyId, lead.id, input)
        : await createLeadAction(agencyId, input);
      if (result.error || !result.lead) {
        setFormError(result.error ?? "Unable to save the lead");
        return;
      }
      if (isEdit) {
        setSuccessMessage("Lead updated.");
        router.refresh();
      }
      onSuccess?.(result.lead);
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-name">
          Lead / company name
        </label>
        <input id="lead-name" type="text" className={styles.input} aria-invalid={Boolean(errors.name)} {...register("name")} />
        {errors.name && <p className={styles.error}>{errors.name.message}</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-contact-name">
            Contact name
          </label>
          <input id="lead-contact-name" type="text" className={styles.input} {...register("contactName")} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-website">
            Website
          </label>
          <input
            id="lead-website"
            type="text"
            inputMode="url"
            placeholder="https://"
            className={styles.input}
            aria-invalid={Boolean(errors.website)}
            {...register("website")}
          />
          {errors.website && <p className={styles.error}>{errors.website.message}</p>}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-email">
            Contact email
          </label>
          <input
            id="lead-email"
            type="email"
            className={styles.input}
            aria-invalid={Boolean(errors.contactEmail)}
            {...register("contactEmail")}
          />
          {errors.contactEmail && <p className={styles.error}>{errors.contactEmail.message}</p>}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-phone">
            Contact phone
          </label>
          <input id="lead-phone" type="tel" className={styles.input} {...register("contactPhone")} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-source">
            Source
          </label>
          <select id="lead-source" className={styles.input} {...register("source")}>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-value">
            Estimated value
          </label>
          <input
            id="lead-value"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 5000"
            className={styles.input}
            aria-invalid={Boolean(errors.estimatedValue)}
            {...register("estimatedValue")}
          />
          {errors.estimatedValue && <p className={styles.error}>{errors.estimatedValue.message}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="lead-notes">
          Notes
        </label>
        <textarea id="lead-notes" rows={3} className={styles.textarea} {...register("notes")} />
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={isPending}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={isPending}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Add lead"}
        </button>
      </div>
    </form>
  );
};

export default LeadForm;
