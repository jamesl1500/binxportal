/**
 * ProposalForm.tsx
 *
 * The draft-proposal editor: an optional client select, title, recipient
 * name/email, a markdown-ish content textarea, currency, tax rate,
 * valid-until date, and a repeatable line-item table. Totals update live and
 * mirror binx-api's `_recalculate` math exactly (subtotal of line amounts,
 * then tax — proposals carry no discount). Used for both creating a new
 * draft and editing an existing one (sent/decided proposals are never
 * editable — the page redirects away). The client select is what actually
 * attaches a proposal to an `AgencyClient` row; picking a client also
 * auto-fills "Recipient name/email" from that client's primary contact
 * info, though both stay plain free text the staff member can override.
 *
 * @module apps/binx-web/src/components/proposals/ProposalForm/ProposalForm.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { ProposalDetail, ProposalInput } from "@/lib/proposals";
import { formatMoneyCents } from "@/lib/money";
import { createProposalAction, updateProposalAction } from "@/app/(app)/proposals/actions";

import styles from "./ProposalForm.module.scss";

interface ClientOption {
  id: string;
  name: string;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
}

interface ProposalFormProps {
  agencyId: string;
  clients: ClientOption[];
  /** Present when editing an existing draft. */
  proposal?: ProposalDetail;
  /** Pre-selects a client on a new draft, e.g. from a client's Proposals tab. */
  initialClientId?: string | null;
}

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string; // dollars, as typed
}

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

const ProposalForm = ({ agencyId, clients, proposal, initialClientId = null }: ProposalFormProps) => {
  const router = useRouter();
  const isEdit = Boolean(proposal);

  const [clientId, setClientId] = useState(proposal?.client_id ?? initialClientId ?? "");
  const [title, setTitle] = useState(proposal?.title ?? "");
  const [recipientName, setRecipientName] = useState(proposal?.recipient_name ?? "");
  const [recipientEmail, setRecipientEmail] = useState(proposal?.recipient_email ?? "");
  const [content, setContent] = useState(proposal?.content ?? "");
  const [currency, setCurrency] = useState(proposal?.currency ?? "USD");
  const [taxRate, setTaxRate] = useState(proposal?.tax_rate_percent ?? "0");
  const [validUntil, setValidUntil] = useState(proposal?.valid_until ? proposal.valid_until.slice(0, 10) : "");
  const [rows, setRows] = useState<LineRow[]>(
    proposal && proposal.line_items.length > 0
      ? proposal.line_items.map((item) => ({
          key: `r${rowCounter++}`,
          description: item.description,
          quantity: item.quantity,
          unitPrice: centsToInput(item.unit_price_cents),
        }))
      : [newRow()],
  );
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    const lineAmounts = rows.map((row) => roundHalfUp((Number.parseFloat(row.quantity) || 0) * toCents(row.unitPrice)));
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);
    const tax = roundHalfUp((subtotal * (Number.parseFloat(taxRate) || 0)) / 100);
    return { lineAmounts, subtotal, tax, total: subtotal + tax };
  }, [rows, taxRate]);

  const canSubmit =
    title.trim() !== "" &&
    rows.some((row) => row.description.trim() !== "" && toCents(row.unitPrice) >= 0 && row.quantity);

  const updateRow = (key: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const input: ProposalInput = {
      leadId: proposal?.lead_id ?? null,
      clientId: clientId || null,
      title: title.trim(),
      recipientName: recipientName.trim() || null,
      recipientEmail: recipientEmail.trim() || null,
      content: content.trim() || null,
      currency: currency.trim().toUpperCase() || "USD",
      taxRatePercent: taxRate || "0",
      validUntil: validUntil || null,
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
        ? await updateProposalAction(agencyId, proposal!.id, input)
        : await createProposalAction(agencyId, input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.proposal) {
        router.push(`/proposals/${result.proposal.id}`);
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
              const id = event.target.value;
              setClientId(id);
              const selected = clients.find((client) => client.id === id);
              if (selected) {
                setRecipientName(selected.primaryContactName ?? "");
                setRecipientEmail(selected.primaryContactEmail ?? "");
              }
            }}
          >
            <option value="">No client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            className={styles.input}
            placeholder="e.g. Website redesign"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Valid until</span>
          <input
            type="date"
            className={styles.input}
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Recipient name</span>
          <input
            className={styles.input}
            placeholder="e.g. Jamie Rivera"
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Recipient email</span>
          <input
            type="email"
            className={styles.input}
            placeholder="jamie@example.com"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Content</span>
        <textarea
          className={styles.textarea}
          rows={6}
          placeholder="What you're proposing, scope, terms…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </label>

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
              placeholder="e.g. Discovery workshop"
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
            <span className={styles.label}>Currency</span>
            <input
              className={styles.input}
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
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
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoneyCents(totals.subtotal, currency)}</dd>
          </div>
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

export default ProposalForm;
