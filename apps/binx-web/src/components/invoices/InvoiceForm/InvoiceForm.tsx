/**
 * InvoiceForm.tsx
 *
 * The draft-invoice editor: client + optional project, issue / due dates, a
 * repeatable line-item table, an invoice-level discount (flat or %) and tax
 * rate, and notes. Totals update live and mirror binx-api's `_recalculate`
 * math exactly. Used for both creating a new draft and editing an existing
 * one (issued invoices are never editable — the page redirects away).
 *
 * @module apps/binx-web/src/components/invoices/InvoiceForm/InvoiceForm.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { BillingSettings, InvoiceDetail, InvoiceInput } from "@/lib/invoicing";
import { formatMoneyCents } from "@/lib/money";
import { createInvoiceAction, updateInvoiceAction } from "@/app/(app)/invoices/actions";

import styles from "./InvoiceForm.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface InvoiceFormProps {
  agencyId: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  billingSettings: BillingSettings;
  /** Present when editing an existing draft. */
  invoice?: InvoiceDetail;
}

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string; // dollars, as typed
}

type DiscountKind = "none" | "amount" | "percent";

let rowCounter = 0;
const newRow = (): LineRow => ({ key: `r${rowCounter++}`, description: "", quantity: "1", unitPrice: "" });

function toCents(dollars: string): number {
  const n = Number.parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
function roundHalfUp(value: number): number {
  return Math.round(value);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const InvoiceForm = ({ agencyId, clients, projects, billingSettings, invoice }: InvoiceFormProps) => {
  const router = useRouter();
  const isEdit = Boolean(invoice);
  const currency = invoice?.currency ?? billingSettings.currency;

  const [clientId, setClientId] = useState(invoice?.client_id ?? clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState(invoice?.project_id ?? "");
  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? todayIso());
  const [dueDate, setDueDate] = useState(
    invoice?.due_date ?? addDays(todayIso(), billingSettings.default_due_days),
  );
  const [rows, setRows] = useState<LineRow[]>(
    invoice && invoice.line_items.length > 0
      ? invoice.line_items.map((item) => ({
          key: `r${rowCounter++}`,
          description: item.description,
          quantity: item.quantity,
          unitPrice: centsToInput(item.unit_price_cents),
        }))
      : [newRow()],
  );
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    invoice?.discount_amount_cents != null ? "amount" : invoice?.discount_percent != null ? "percent" : "none",
  );
  const [discountValue, setDiscountValue] = useState(
    invoice?.discount_amount_cents != null
      ? centsToInput(invoice.discount_amount_cents)
      : invoice?.discount_percent != null
        ? invoice.discount_percent
        : "",
  );
  const [taxRate, setTaxRate] = useState(
    invoice?.tax_rate_percent ?? billingSettings.default_tax_rate_percent ?? "0",
  );
  const [notes, setNotes] = useState(invoice?.notes ?? billingSettings.default_notes ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    invoice?.payment_instructions ?? billingSettings.payment_instructions ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    const lineAmounts = rows.map((row) => roundHalfUp((Number.parseFloat(row.quantity) || 0) * toCents(row.unitPrice)));
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);
    let discount = 0;
    if (discountKind === "amount") {
      discount = Math.min(toCents(discountValue), subtotal);
    } else if (discountKind === "percent") {
      discount = roundHalfUp((subtotal * (Number.parseFloat(discountValue) || 0)) / 100);
    }
    const taxable = subtotal - discount;
    const tax = roundHalfUp((taxable * (Number.parseFloat(taxRate) || 0)) / 100);
    return { lineAmounts, subtotal, discount, tax, total: taxable + tax };
  }, [rows, discountKind, discountValue, taxRate]);

  const clientProjects = projects.filter((project) => project.client_id === clientId);
  const canSubmit =
    clientId !== "" && rows.some((row) => row.description.trim() !== "" && toCents(row.unitPrice) >= 0 && row.quantity);

  const updateRow = (key: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const input: InvoiceInput = {
      clientId,
      projectId: projectId || null,
      issueDate,
      dueDate,
      discountAmountCents: discountKind === "amount" ? toCents(discountValue) : null,
      discountPercent: discountKind === "percent" ? discountValue || "0" : null,
      taxRatePercent: taxRate || "0",
      notes: notes.trim() || null,
      paymentInstructions: paymentInstructions.trim() || null,
      lineItems: rows
        .filter((row) => row.description.trim() !== "")
        .map((row) => ({
          description: row.description.trim(),
          quantity: String(Number.parseFloat(row.quantity) || 0),
          unitPriceCents: toCents(row.unitPrice),
        })),
    };

    setSubmitting(true);
    try {
      const result = isEdit
        ? await updateInvoiceAction(agencyId, invoice!.id, input)
        : await createInvoiceAction(agencyId, input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.invoice) {
        router.push(`/invoices/${result.invoice.id}`);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Client</span>
          <select
            className={styles.input}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setProjectId("");
            }}
            required
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Project (optional)</span>
          <select
            className={styles.input}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">None</option>
            {clientProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Issue date</span>
          <input
            type="date"
            className={styles.input}
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Due date</span>
          <input
            type="date"
            className={styles.input}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.lines}>
        <div className={styles.lineHead}>
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span className={styles.lineAmountHead}>Amount</span>
          <span aria-hidden="true" />
        </div>
        {rows.map((row, index) => (
          <div key={row.key} className={styles.lineRow}>
            <input
              className={styles.input}
              placeholder="e.g. Design retainer — March"
              value={row.description}
              onChange={(event) => updateRow(row.key, { description: event.target.value })}
              aria-label={`Line ${index + 1} description`}
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={row.quantity}
              onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
              aria-label={`Line ${index + 1} quantity`}
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={row.unitPrice}
              onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
              aria-label={`Line ${index + 1} unit price`}
            />
            <span className={styles.lineAmount}>{formatMoneyCents(totals.lineAmounts[index] ?? 0, currency)}</span>
            <button
              type="button"
              className={styles.removeRow}
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))}
              disabled={rows.length <= 1}
              aria-label={`Remove line ${index + 1}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className={styles.addRow} onClick={() => setRows((prev) => [...prev, newRow()])}>
          <Plus aria-hidden="true" /> Add line
        </button>
      </div>

      <div className={styles.bottom}>
        <div className={styles.terms}>
          <label className={styles.field}>
            <span className={styles.label}>Discount</span>
            <div className={styles.discountRow}>
              <select
                className={styles.input}
                value={discountKind}
                onChange={(event) => setDiscountKind(event.target.value as DiscountKind)}
              >
                <option value="none">None</option>
                <option value="amount">Flat amount</option>
                <option value="percent">Percentage</option>
              </select>
              {discountKind !== "none" && (
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={discountKind === "percent" ? "%" : "0.00"}
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  aria-label="Discount value"
                />
              )}
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Tax rate (%)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={taxRate}
              onChange={(event) => setTaxRate(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Notes</span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Payment instructions</span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={paymentInstructions}
              onChange={(event) => setPaymentInstructions(event.target.value)}
            />
          </label>
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoneyCents(totals.subtotal, currency)}</dd>
          </div>
          {totals.discount > 0 && (
            <div>
              <dt>Discount</dt>
              <dd>−{formatMoneyCents(totals.discount, currency)}</dd>
            </div>
          )}
          {totals.tax > 0 && (
            <div>
              <dt>Tax</dt>
              <dd>{formatMoneyCents(totals.tax, currency)}</dd>
            </div>
          )}
          <div className={styles.grandTotal}>
            <dt>Total</dt>
            <dd>{formatMoneyCents(totals.total, currency)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={!canSubmit || submitting}>
          {submitting ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
        </button>
      </div>
    </form>
  );
};

export default InvoiceForm;
