/**
 * RecurringScheduleForm.tsx
 *
 * The recurring-invoice (retainer) schedule editor: client + optional
 * project, title, cadence (weekly/monthly, with the day-of-month or weekday
 * field shown conditionally), due days, tax rate, notes, payment
 * instructions, an auto-issue toggle, an optional start date, and a
 * repeatable line-item table (the same add/remove UX as `InvoiceForm`).
 * Create-only for this first pass — schedules can be paused and recreated
 * instead of edited in place.
 *
 * @module apps/binx-web/src/components/invoices/RecurringScheduleForm/RecurringScheduleForm.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatMoneyCents } from "@/lib/money";
import { type RecurringInterval, type RecurringScheduleInput, weekdayLabel } from "@/lib/recurring-invoices";
import { createRecurringScheduleAction } from "@/app/(app)/invoices/recurring/actions";

import styles from "./RecurringScheduleForm.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface RecurringScheduleFormProps {
  agencyId: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  currency: string;
  defaultDueDays: number;
  defaultTaxRatePercent: string;
}

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string; // dollars, as typed
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

let rowCounter = 0;
const newRow = (): LineRow => ({ key: `r${rowCounter++}`, description: "", quantity: "1", unitPrice: "" });

function toCents(dollars: string): number {
  const n = Number.parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function roundHalfUp(value: number): number {
  return Math.round(value);
}

const RecurringScheduleForm = ({
  agencyId,
  clients,
  projects,
  currency,
  defaultDueDays,
  defaultTaxRatePercent,
}: RecurringScheduleFormProps) => {
  const router = useRouter();

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [intervalType, setIntervalType] = useState<RecurringInterval>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [weekday, setWeekday] = useState("0");
  const [dueDays, setDueDays] = useState(String(defaultDueDays));
  const [taxRate, setTaxRate] = useState(defaultTaxRatePercent || "0");
  const [notes, setNotes] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [autoIssue, setAutoIssue] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);

  const totals = useMemo(() => {
    const lineAmounts = rows.map((row) => roundHalfUp((Number.parseFloat(row.quantity) || 0) * toCents(row.unitPrice)));
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);
    const tax = roundHalfUp((subtotal * (Number.parseFloat(taxRate) || 0)) / 100);
    return { lineAmounts, subtotal, tax, total: subtotal + tax };
  }, [rows, taxRate]);

  const clientProjects = projects.filter((project) => project.client_id === clientId);
  const canSubmit =
    clientId !== "" &&
    title.trim() !== "" &&
    rows.some((row) => row.description.trim() !== "" && toCents(row.unitPrice) >= 0 && row.quantity);

  const updateRow = (key: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const input: RecurringScheduleInput = {
      clientId,
      projectId: projectId || null,
      title: title.trim(),
      interval: intervalType,
      intervalCount: Number.parseInt(intervalCount, 10) || 1,
      dayOfMonth: intervalType === "monthly" ? Number.parseInt(dayOfMonth, 10) || 1 : null,
      weekday: intervalType === "weekly" ? Number.parseInt(weekday, 10) || 0 : null,
      dueDays: Number.parseInt(dueDays, 10) || 0,
      taxRatePercent: taxRate || "0",
      notes: notes.trim() || null,
      paymentInstructions: paymentInstructions.trim() || null,
      autoIssue,
      startDate: startDate || null,
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
      const result = await createRecurringScheduleAction(agencyId, input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.schedule) {
        router.push("/invoices/recurring");
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
          <select className={styles.input} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">None</option>
            {clientProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            className={styles.input}
            placeholder="e.g. Monthly retainer"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Start date (optional)</span>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
      </div>

      <fieldset className={styles.cadence}>
        <legend className={styles.label}>Cadence</legend>
        <div className={styles.cadenceRow}>
          <label className={styles.radio}>
            <input
              type="radio"
              name="interval"
              value="weekly"
              checked={intervalType === "weekly"}
              onChange={() => setIntervalType("weekly")}
            />
            Weekly
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              name="interval"
              value="monthly"
              checked={intervalType === "monthly"}
              onChange={() => setIntervalType("monthly")}
            />
            Monthly
          </label>

          <label className={styles.inlineField}>
            <span className={styles.inlineLabel}>Every</span>
            <input
              type="number"
              min="1"
              max="52"
              className={styles.smallInput}
              value={intervalCount}
              onChange={(event) => setIntervalCount(event.target.value)}
              aria-label="Interval count"
            />
            <span className={styles.inlineLabel}>{intervalType === "weekly" ? "week(s)" : "month(s)"}</span>
          </label>

          {intervalType === "monthly" ? (
            <label className={styles.inlineField}>
              <span className={styles.inlineLabel}>On day</span>
              <select
                className={styles.smallInput}
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(event.target.value)}
                aria-label="Day of month"
              >
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className={styles.inlineField}>
              <span className={styles.inlineLabel}>On</span>
              <select
                className={styles.smallInput}
                value={weekday}
                onChange={(event) => setWeekday(event.target.value)}
                aria-label="Weekday"
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {weekdayLabel(day)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </fieldset>

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
              placeholder="e.g. Design retainer"
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
            <span className={styles.label}>Due days</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              value={dueDays}
              onChange={(event) => setDueDays(event.target.value)}
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

          <label className={styles.checkboxField}>
            <input type="checkbox" checked={autoIssue} onChange={(event) => setAutoIssue(event.target.checked)} />
            Auto-issue generated invoices (skip the draft step)
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
          {totals.tax > 0 && (
            <div>
              <dt>Tax</dt>
              <dd>{formatMoneyCents(totals.tax, currency)}</dd>
            </div>
          )}
          <div className={styles.grandTotal}>
            <dt>Est. per invoice</dt>
            <dd>{formatMoneyCents(totals.total, currency)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={!canSubmit || submitting}>
          {submitting ? "Saving…" : "Create schedule"}
        </button>
      </div>
    </form>
  );
};

export default RecurringScheduleForm;
