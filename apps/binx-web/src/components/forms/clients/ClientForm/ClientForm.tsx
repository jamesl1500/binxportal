/**
 * ClientForm.tsx
 *
 * Shared create/edit form for a client: name plus optional contact details
 * and notes. Create and edit only differ in default values and which server
 * action they call — sharing one component keeps the two in sync as fields
 * are added. Used on the dedicated `/clients/new` page via NewClientForm
 * (create) and directly on the client detail page (edit) — the caller owns
 * any surrounding chrome, this only owns the fields and submission.
 *
 * @module apps/binx-web/src/components/forms/clients/ClientForm/ClientForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createClientAction, updateClientAction } from "@/app/(app)/clients/actions";
import type { AgencyClient } from "@/lib/clients";

import styles from "./ClientForm.module.scss";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(255, "Must be at most 255 characters"),
  primaryContactName: z.string().trim().max(255, "Must be at most 255 characters").optional(),
  primaryContactEmail: z.email("Enter a valid email address").optional().or(z.literal("")),
  primaryContactPhone: z.string().trim().max(32, "Must be at most 32 characters").optional(),
  website: z.string().trim().max(2048, "Must be at most 2048 characters").optional(),
  notes: z.string().trim().max(4096, "Must be at most 4096 characters").optional(),
  billingEmail: z.email("Enter a valid email address").optional().or(z.literal("")),
  billingAddress: z.string().trim().max(2048, "Must be at most 2048 characters").optional(),
});

type ClientValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  agencyId: string;
  /** Omit for create mode; pass the client being edited for edit mode. */
  client?: AgencyClient;
  /**
   * Called after a successful save. Optional — edit mode already shows its
   * own inline success message and refreshes the route itself (so a header
   * showing the client's name stays in sync); callers only need this to
   * react further, e.g. NewClientForm navigating to the new client's page.
   */
  onSuccess?: (client: AgencyClient) => void;
  onCancel?: () => void;
}

const ClientForm = ({ agencyId, client, onSuccess, onCancel }: ClientFormProps) => {
  const isEdit = Boolean(client);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? "",
      primaryContactName: client?.primary_contact_name ?? "",
      primaryContactEmail: client?.primary_contact_email ?? "",
      primaryContactPhone: client?.primary_contact_phone ?? "",
      website: client?.website ?? "",
      notes: client?.notes ?? "",
      billingEmail: client?.billing_email ?? "",
      billingAddress: client?.billing_address ?? "",
    },
  });

  const onSubmit = (values: ClientValues) => {
    setFormError(null);
    setSuccessMessage(null);

    const input = {
      name: values.name.trim(),
      primaryContactName: values.primaryContactName?.trim() || null,
      primaryContactEmail: values.primaryContactEmail?.trim() || null,
      primaryContactPhone: values.primaryContactPhone?.trim() || null,
      website: values.website?.trim() || null,
      notes: values.notes?.trim() || null,
      billingEmail: values.billingEmail?.trim() || null,
      billingAddress: values.billingAddress?.trim() || null,
    };

    startTransition(async () => {
      const result = client
        ? await updateClientAction(agencyId, client.id, input)
        : await createClientAction(agencyId, input);

      if (result.error || !result.client) {
        setFormError(result.error ?? "Unable to save client");
        return;
      }

      if (isEdit) {
        setSuccessMessage("Client updated.");
        router.refresh();
      }
      onSuccess?.(result.client);
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="clientName">
          Client name
        </label>
        <input
          id="clientName"
          type="text"
          autoComplete="organization"
          className={styles.input}
          aria-invalid={Boolean(errors.name)}
          {...register("name")}
        />
        {errors.name && <p className={styles.error}>{errors.name.message}</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="primaryContactName">
            Primary contact
          </label>
          <input
            id="primaryContactName"
            type="text"
            autoComplete="name"
            className={styles.input}
            aria-invalid={Boolean(errors.primaryContactName)}
            {...register("primaryContactName")}
          />
          {errors.primaryContactName && <p className={styles.error}>{errors.primaryContactName.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="website">
            Website
          </label>
          <input
            id="website"
            type="text"
            inputMode="url"
            placeholder="https://"
            autoComplete="url"
            className={styles.input}
            aria-invalid={Boolean(errors.website)}
            {...register("website")}
          />
          {errors.website && <p className={styles.error}>{errors.website.message}</p>}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="primaryContactEmail">
            Contact email
          </label>
          <input
            id="primaryContactEmail"
            type="email"
            autoComplete="email"
            className={styles.input}
            aria-invalid={Boolean(errors.primaryContactEmail)}
            {...register("primaryContactEmail")}
          />
          {errors.primaryContactEmail && <p className={styles.error}>{errors.primaryContactEmail.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="primaryContactPhone">
            Contact phone
          </label>
          <input
            id="primaryContactPhone"
            type="tel"
            autoComplete="tel"
            className={styles.input}
            aria-invalid={Boolean(errors.primaryContactPhone)}
            {...register("primaryContactPhone")}
          />
          {errors.primaryContactPhone && <p className={styles.error}>{errors.primaryContactPhone.message}</p>}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="billingEmail">
            Billing email
          </label>
          <input
            id="billingEmail"
            type="email"
            autoComplete="email"
            placeholder="Defaults to the contact email"
            className={styles.input}
            aria-invalid={Boolean(errors.billingEmail)}
            {...register("billingEmail")}
          />
          {errors.billingEmail && <p className={styles.error}>{errors.billingEmail.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="billingAddress">
            Billing address
          </label>
          <textarea
            id="billingAddress"
            rows={2}
            className={styles.textarea}
            aria-invalid={Boolean(errors.billingAddress)}
            {...register("billingAddress")}
          />
          {errors.billingAddress && <p className={styles.error}>{errors.billingAddress.message}</p>}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          rows={4}
          className={styles.textarea}
          aria-invalid={Boolean(errors.notes)}
          {...register("notes")}
        />
        {errors.notes && <p className={styles.error}>{errors.notes.message}</p>}
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
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create client"}
        </button>
      </div>
    </form>
  );
};

export default ClientForm;
