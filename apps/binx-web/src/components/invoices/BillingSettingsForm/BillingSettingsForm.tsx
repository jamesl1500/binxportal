/**
 * BillingSettingsForm.tsx
 *
 * The agency's invoicing configuration: the "from" block that every invoice
 * renders, the currency, the numbering scheme, and the defaults a new invoice
 * is seeded with. Owner/admin only — members see a read-only summary.
 *
 * @module apps/binx-web/src/components/invoices/BillingSettingsForm/BillingSettingsForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { BillingSettings } from "@/lib/invoicing";
import { updateBillingSettingsAction } from "@/app/(app)/invoices/actions";

import styles from "./BillingSettingsForm.module.scss";

const schema = z.object({
  legalName: z.string().trim().max(255).optional().or(z.literal("")),
  address: z.string().trim().max(2048).optional().or(z.literal("")),
  taxId: z.string().trim().max(64).optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "3-letter currency code"),
  invoicePrefix: z.string().max(16),
  nextInvoiceNumber: z.number().int().min(1),
  numberPadding: z.number().int().min(1).max(9),
  defaultDueDays: z.number().int().min(0).max(365),
  defaultTaxRatePercent: z.number().min(0).max(100),
  paymentInstructions: z.string().trim().max(2048).optional().or(z.literal("")),
  defaultNotes: z.string().trim().max(4096).optional().or(z.literal("")),
});

type Values = z.infer<typeof schema>;

interface BillingSettingsFormProps {
  agencyId: string;
  settings: BillingSettings;
  canManage: boolean;
}

const BillingSettingsForm = ({ agencyId, settings, canManage }: BillingSettingsFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: settings.legal_name ?? "",
      address: settings.address ?? "",
      taxId: settings.tax_id ?? "",
      contactEmail: settings.contact_email ?? "",
      currency: settings.currency,
      invoicePrefix: settings.invoice_prefix,
      nextInvoiceNumber: settings.next_invoice_number,
      numberPadding: settings.number_padding,
      defaultDueDays: settings.default_due_days,
      defaultTaxRatePercent: Number.parseFloat(settings.default_tax_rate_percent),
      paymentInstructions: settings.payment_instructions ?? "",
      defaultNotes: settings.default_notes ?? "",
    },
  });

  if (!canManage) {
    return (
      <div className={styles.readonly}>
        <p className={styles.readonlyNote}>Only an owner or admin can change billing settings.</p>
        <dl className={styles.summary}>
          <div>
            <dt>Billing name</dt>
            <dd>{settings.legal_name || "—"}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{settings.currency}</dd>
          </div>
          <div>
            <dt>Next number</dt>
            <dd>
              {settings.invoice_prefix}
              {String(settings.next_invoice_number).padStart(settings.number_padding, "0")}
            </dd>
          </div>
          <div>
            <dt>Default terms</dt>
            <dd>Net {settings.default_due_days} days · {Number.parseFloat(settings.default_tax_rate_percent)}% tax</dd>
          </div>
        </dl>
      </div>
    );
  }

  const onSubmit = (values: Values) => {
    setFormError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBillingSettingsAction(agencyId, {
        legalName: values.legalName?.trim() || null,
        address: values.address?.trim() || null,
        taxId: values.taxId?.trim() || null,
        contactEmail: values.contactEmail?.trim() || null,
        currency: values.currency.toUpperCase(),
        invoicePrefix: values.invoicePrefix,
        nextInvoiceNumber: values.nextInvoiceNumber,
        numberPadding: values.numberPadding,
        defaultDueDays: values.defaultDueDays,
        defaultTaxRatePercent: String(values.defaultTaxRatePercent),
        paymentInstructions: values.paymentInstructions?.trim() || null,
        defaultNotes: values.defaultNotes?.trim() || null,
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Invoice &ldquo;from&rdquo; block</legend>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="legalName">
            Billing name
          </label>
          <input id="legalName" className={styles.input} {...register("legalName")} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="address">
            Address
          </label>
          <textarea id="address" className={styles.textarea} rows={3} {...register("address")} />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="taxId">
              Tax ID
            </label>
            <input id="taxId" className={styles.input} {...register("taxId")} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="contactEmail">
              Billing email
            </label>
            <input id="contactEmail" className={styles.input} {...register("contactEmail")} />
            {errors.contactEmail && <p className={styles.error}>{errors.contactEmail.message}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Numbering &amp; currency</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="currency">
              Currency
            </label>
            <input id="currency" className={styles.input} maxLength={3} {...register("currency")} />
            {errors.currency && <p className={styles.error}>{errors.currency.message}</p>}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="invoicePrefix">
              Number prefix
            </label>
            <input id="invoicePrefix" className={styles.input} {...register("invoicePrefix")} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="nextInvoiceNumber">
              Next number
            </label>
            <input
              id="nextInvoiceNumber"
              type="number"
              min="1"
              className={styles.input}
              {...register("nextInvoiceNumber", { valueAsNumber: true })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="numberPadding">
              Digits
            </label>
            <input
              id="numberPadding"
              type="number"
              min="1"
              max="9"
              className={styles.input}
              {...register("numberPadding", { valueAsNumber: true })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>New-invoice defaults</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="defaultDueDays">
              Payment terms (days)
            </label>
            <input
              id="defaultDueDays"
              type="number"
              min="0"
              className={styles.input}
              {...register("defaultDueDays", { valueAsNumber: true })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="defaultTaxRatePercent">
              Default tax rate (%)
            </label>
            <input
              id="defaultTaxRatePercent"
              type="number"
              min="0"
              max="100"
              step="0.001"
              className={styles.input}
              {...register("defaultTaxRatePercent", { valueAsNumber: true })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="paymentInstructions">
            Payment instructions
          </label>
          <textarea
            id="paymentInstructions"
            className={styles.textarea}
            rows={2}
            {...register("paymentInstructions")}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="defaultNotes">
            Default notes
          </label>
          <textarea id="defaultNotes" className={styles.textarea} rows={2} {...register("defaultNotes")} />
        </div>
      </fieldset>

      {formError && <p className={styles.formError}>{formError}</p>}
      {saved && <p className={styles.formSuccess}>Billing settings saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save billing settings"}
      </button>
    </form>
  );
};

export default BillingSettingsForm;
