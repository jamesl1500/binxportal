/**
 * ProposalForm.tsx
 *
 * The draft-proposal editor: an optional client select, title, recipient
 * name/email, a markdown-ish content textarea, currency, tax rate,
 * valid-until date, and a repeatable line-item table (typed by hand or
 * picked from the services catalog, with optional client-facing details
 * under each line). Each line is one-time or monthly (a retainer, totalled
 * per month and billed every month once accepted). A proposal can also
 * offer packages (the client picks one; a line can belong to one) and
 * optional add-ons (the client ticks them or not). Totals update live and
 * mirror binx-api's `_recalculate` math exactly (subtotals of the lines in
 * the starting choice: the recommended package and pre-selected add-ons,
 * then tax — proposals carry no discount).
 *
 * Templates use it too: `fromTemplate` prefills a new proposal from one
 * (binx-api copies its documents on create), and `templateEditor` edits a
 * template itself (a name and description instead of who it's for, and how
 * many days proposals made from it stay open instead of a date). Used for both creating a new
 * draft and editing an existing one (sent/decided proposals are never
 * editable — the page redirects away). The client select is what actually
 * attaches a proposal to an `AgencyClient` row; picking a client also
 * auto-fills "Recipient name/email" from that client's primary contact
 * info, though both stay plain free text the staff member can override.
 *
 * @module apps/binx-web/src/components/proposals/ProposalForm/ProposalForm.tsx
 * @author Binx Portal
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  ProposalDetail,
  ProposalInput,
  ProposalTemplateData,
} from "@/lib/proposals";
import { formatMoneyCents } from "@/lib/money";
import {
  billingSuffix,
  type LineBilling,
  PER_MONTH,
  proposalTotalRows,
} from "@/lib/proposals-client";
import { lineValuesFromService, type Service } from "@/lib/services-client";
import ServicePicker from "@/components/services/ServicePicker/ServicePicker";
import {
  createProposalAction,
  updateProposalAction,
} from "@/app/(app)/proposals/actions";
import {
  createTemplateAction,
  updateTemplateAction,
} from "@/app/(app)/proposals/templates/actions";

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
  /** Active catalog services for "Add from services". */
  services?: Service[];
  /** The lead a new proposal is for, e.g. from the lead's page. */
  lead?: LeadOption | null;
  /** Kickoff questionnaires a new project can start with. */
  kickoffTemplates?: { id: string; name: string }[];
  /** Start a new proposal from this template (prefilled). */
  fromTemplate?: TemplateStart | null;
  /** Edit a template (or make one, without an id) instead of a proposal. */
  templateEditor?: TemplateEditor | null;
}

export interface TemplateStart {
  id: string;
  name: string;
  data: ProposalTemplateData;
  attachmentCount: number;
}

export interface TemplateEditor {
  id?: string;
  name: string;
  description: string;
  data?: ProposalTemplateData | null;
}

/** What the editor starts from: a proposal, or a template's contents. */
interface Seed {
  title: string;
  content: string | null;
  currency: string;
  tax_rate_percent: string;
  valid_until: string | null;
  valid_for_days: number | null;
  line_items: {
    description: string;
    details: string | null;
    quantity: string;
    unit_price_cents: number;
    service_id: string | null;
    billing: string;
    package_id: string | null;
    optional: boolean;
    selected: boolean;
  }[];
  packages: {
    id: string;
    name: string;
    description: string | null;
    recommended: boolean;
  }[];
  requires_countersign: boolean;
  require_email_code: boolean;
  deposit_percent: string | null;
  create_project_on_accept: boolean;
  kickoff_template_id: string | null;
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function seedFromProposal(proposal: ProposalDetail): Seed {
  return {
    ...proposal,
    tax_rate_percent: String(proposal.tax_rate_percent),
    valid_for_days: null,
    deposit_percent: proposal.deposit_percent ? String(proposal.deposit_percent) : null,
    kickoff_template_id: proposal.kickoff_template_id ?? null,
    require_email_code: proposal.require_email_code ?? false,
    create_project_on_accept: proposal.create_project_on_accept ?? false,
    line_items: proposal.line_items.map((item) => ({
      ...item,
      quantity: String(item.quantity),
      service_id: item.service_id ?? null,
      billing: item.billing ?? "one_time",
      package_id: item.package_id ?? null,
      optional: item.optional ?? false,
      selected: item.selected ?? true,
    })),
    packages: proposal.packages ?? [],
  };
}

function seedFromTemplate(data: ProposalTemplateData): Seed {
  return {
    title: data.title,
    content: data.content ?? null,
    currency: data.currency ?? "USD",
    tax_rate_percent: String(data.tax_rate_percent ?? "0"),
    valid_until: data.valid_for_days ? daysFromToday(data.valid_for_days) : null,
    valid_for_days: data.valid_for_days ?? null,
    line_items: (data.line_items ?? []).map((line) => ({
      description: line.description,
      details: line.details ?? null,
      quantity: String(line.quantity),
      unit_price_cents: line.unit_price_cents,
      service_id: line.service_id ?? null,
      billing: line.billing ?? "one_time",
      // A template's lines point at its packages by key.
      package_id: line.package_key ?? null,
      optional: line.optional ?? false,
      selected: line.selected ?? true,
    })),
    packages: (data.packages ?? []).map((pkg) => ({
      id: pkg.key,
      name: pkg.name,
      description: pkg.description ?? null,
      recommended: pkg.recommended ?? false,
    })),
    requires_countersign: data.requires_countersign ?? false,
    require_email_code: data.require_email_code ?? false,
    deposit_percent: data.deposit_percent ? String(data.deposit_percent) : null,
    create_project_on_accept: data.create_project_on_accept ?? false,
    kickoff_template_id: data.kickoff_template_id ?? null,
  };
}

interface LeadOption {
  id: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
}

interface LineRow {
  key: string;
  description: string;
  details: string;
  /** The details box stays open once opened, even if emptied again. */
  showDetails: boolean;
  quantity: string;
  unitPrice: string; // dollars, as typed
  serviceId: string | null;
  /** Monthly lines are a retainer: totalled per month, billed every month. */
  billing: LineBilling;
  /** The package it's in (a PackageRow key); null: every package. */
  packageKey: string | null;
  /** Always in, or an add-on the client can tick (pre-selected or not). */
  kind: LineKind;
}

type LineKind = "included" | "add_on" | "add_on_on";

interface PackageRow {
  key: string;
  name: string;
  description: string;
  recommended: boolean;
}

/** binx-api proposals/models.py MAX_PROPOSAL_PACKAGES. */
const MAX_PACKAGES = 4;

let packageCounter = 0;
const newPackage = (): PackageRow => ({
  key: `p${packageCounter++}`,
  name: "",
  description: "",
  recommended: false,
});

/** Why the packages can't be saved yet, if they can't. */
function packageProblem(packages: PackageRow[], rows: LineRow[]): string | null {
  if (packages.length === 0) return null;
  const names = packages.map((pkg) => pkg.name.trim().toLowerCase());
  if (names.some((name) => name === "")) return "Give each package a name.";
  if (new Set(names).size !== names.length)
    return "Give each package a different name.";
  const empty = packages.find(
    (pkg) =>
      !rows.some(
        (row) => row.packageKey === pkg.key && row.description.trim() !== "",
      ),
  );
  return empty ? `Add at least one line to ${empty.name.trim()}.` : null;
}

let rowCounter = 0;
const newRow = (): LineRow => ({
  key: `r${rowCounter++}`,
  description: "",
  details: "",
  showDetails: false,
  quantity: "1",
  unitPrice: "",
  serviceId: null,
  billing: "one_time",
  packageKey: null,
  kind: "included",
});

const isBlank = (row: LineRow) =>
  row.description.trim() === "" && row.unitPrice.trim() === "";

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

const ProposalForm = ({
  agencyId,
  clients,
  proposal,
  initialClientId = null,
  services = [],
  lead = null,
  kickoffTemplates = [],
  fromTemplate = null,
  templateEditor = null,
}: ProposalFormProps) => {
  const router = useRouter();
  const isEdit = Boolean(proposal);
  const isTemplate = Boolean(templateEditor);
  const templateData = fromTemplate?.data ?? templateEditor?.data ?? null;
  const seed: Seed | null = proposal
    ? seedFromProposal(proposal)
    : templateData
      ? seedFromTemplate(templateData)
      : null;
  const [templateName, setTemplateName] = useState(templateEditor?.name ?? "");
  const [templateDescription, setTemplateDescription] = useState(
    templateEditor?.description ?? "",
  );
  const [validForDays, setValidForDays] = useState(
    seed?.valid_for_days ? String(seed.valid_for_days) : "",
  );

  const [clientId, setClientId] = useState(
    proposal?.client_id ?? initialClientId ?? "",
  );
  const [title, setTitle] = useState(seed?.title ?? "");
  const [leadId, setLeadId] = useState<string | null>(
    proposal ? proposal.lead_id : (lead?.id ?? null),
  );
  const leadName = proposal?.lead_name ?? lead?.name ?? null;
  const [recipientName, setRecipientName] = useState(
    proposal?.recipient_name ?? lead?.contactName ?? "",
  );
  const [recipientEmail, setRecipientEmail] = useState(
    proposal?.recipient_email ?? lead?.contactEmail ?? "",
  );
  const [content, setContent] = useState(seed?.content ?? "");
  const [currency, setCurrency] = useState(seed?.currency ?? "USD");
  const [taxRate, setTaxRate] = useState(seed?.tax_rate_percent ?? "0");
  const [validUntil, setValidUntil] = useState(
    seed?.valid_until ? seed.valid_until.slice(0, 10) : "",
  );
  const [rows, setRows] = useState<LineRow[]>(
    seed && seed.line_items.length > 0
      ? seed.line_items.map((item) => ({
          key: `r${rowCounter++}`,
          description: item.description,
          details: item.details ?? "",
          showDetails: Boolean(item.details),
          quantity: item.quantity,
          unitPrice: centsToInput(item.unit_price_cents),
          serviceId: item.service_id ?? null,
          billing: item.billing === "monthly" ? "monthly" : "one_time",
          packageKey: item.package_id ?? null,
          kind: item.optional
            ? item.selected
              ? "add_on_on"
              : "add_on"
            : "included",
        }))
      : [newRow()],
  );
  // Keyed by the package's id when editing, so lines keep pointing at it.
  const [packages, setPackages] = useState<PackageRow[]>(
    (seed?.packages ?? []).map((pkg) => ({
      key: pkg.id,
      name: pkg.name,
      description: pkg.description ?? "",
      recommended: pkg.recommended,
    })),
  );
  const [requiresCountersign, setRequiresCountersign] = useState(
    seed?.requires_countersign ?? false,
  );
  const [requireEmailCode, setRequireEmailCode] = useState(
    seed?.require_email_code ?? false,
  );
  const [depositPercent, setDepositPercent] = useState(
    seed?.deposit_percent
      ? String(Number.parseFloat(seed.deposit_percent))
      : "",
  );
  const [createProject, setCreateProject] = useState(
    seed?.create_project_on_accept ?? Boolean(lead),
  );
  const [kickoffTemplateId, setKickoffTemplateId] = useState(
    seed?.kickoff_template_id ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  // The package the client starts on: the recommended one, else the first.
  const startingPackage =
    packages.find((pkg) => pkg.recommended) ?? packages[0] ?? null;

  // Mirrors binx-api's _recalculate: one-time lines make the total, monthly
  // lines a per-month total, both taxed at the same rate. Only lines in the
  // starting choice count (every-package lines and the starting package's,
  // add-ons only when pre-selected).
  const totals = useMemo(() => {
    const lineAmounts = rows.map((row) =>
      roundHalfUp(
        (Number.parseFloat(row.quantity) || 0) * toCents(row.unitPrice),
      ),
    );
    const startingKey = startingPackage?.key ?? null;
    const counts = (row: LineRow | undefined) =>
      Boolean(row) &&
      (row!.packageKey === null || row!.packageKey === startingKey) &&
      row!.kind !== "add_on";
    const sumOf = (billing: LineBilling) =>
      lineAmounts.reduce(
        (sum, amount, index) =>
          rows[index]?.billing === billing && counts(rows[index])
            ? sum + amount
            : sum,
        0,
      );
    const taxOf = (cents: number) =>
      roundHalfUp((cents * (Number.parseFloat(taxRate) || 0)) / 100);
    const subtotal = sumOf("one_time");
    const monthly = sumOf("monthly");
    return {
      lineAmounts,
      hasMonthly: rows.some(
        (row) => row.billing === "monthly" && row.description.trim() !== "",
      ),
      rows: proposalTotalRows({
        tax_rate_percent: taxRate || "0",
        subtotal_cents: subtotal,
        tax_cents: taxOf(subtotal),
        total_cents: subtotal + taxOf(subtotal),
        monthly_subtotal_cents: monthly,
        monthly_tax_cents: taxOf(monthly),
        monthly_total_cents: monthly + taxOf(monthly),
      }),
    };
  }, [rows, taxRate, startingPackage]);

  const hasAddOns = rows.some((row) => row.kind !== "included");
  const problem = packageProblem(packages, rows);

  const canSubmit =
    title.trim() !== "" &&
    (!isTemplate || templateName.trim() !== "") &&
    problem === null &&
    rows.some(
      (row) =>
        row.description.trim() !== "" &&
        toCents(row.unitPrice) >= 0 &&
        row.quantity,
    );

  const updateRow = (key: string, patch: Partial<LineRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const updatePackage = (key: string, patch: Partial<PackageRow>) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.key === key ? { ...pkg, ...patch } : pkg)),
    );
  };

  const recommend = (key: string) => {
    setPackages((prev) =>
      prev.map((pkg) => ({ ...pkg, recommended: pkg.key === key })),
    );
  };

  // A package's lines move to every package when it goes.
  const removePackages = (keys: string[]) => {
    setPackages((prev) => prev.filter((pkg) => !keys.includes(pkg.key)));
    setRows((prev) =>
      prev.map((row) =>
        row.packageKey && keys.includes(row.packageKey)
          ? { ...row, packageKey: null }
          : row,
      ),
    );
  };

  // Fill the empty last line if there is one, else add a line.
  const addService = (service: Service) => {
    const values = lineValuesFromService(service);
    setRows((prev) => {
      const filled: LineRow = {
        ...newRow(),
        ...values,
        showDetails: values.details !== "",
      };
      const last = prev[prev.length - 1];
      return last && isBlank(last)
        ? [...prev.slice(0, -1), { ...filled, key: last.key }]
        : [...prev, filled];
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    const input: ProposalInput = {
      leadId,
      clientId: clientId || null,
      title: title.trim(),
      recipientName: recipientName.trim() || null,
      recipientEmail: recipientEmail.trim() || null,
      content: content.trim() || null,
      currency: currency.trim().toUpperCase() || "USD",
      taxRatePercent: taxRate || "0",
      validUntil: validUntil || null,
      requiresCountersign,
      requireEmailCode,
      depositPercent: depositPercent.trim() || null,
      createProjectOnAccept: createProject,
      kickoffTemplateId: createProject ? kickoffTemplateId || null : null,
      lineItems: rows
        .filter((row) => row.description.trim() !== "")
        .map((row) => ({
          description: row.description.trim(),
          details: row.details.trim() || null,
          quantity: String(Number.parseFloat(row.quantity) || 0),
          unitPriceCents: toCents(row.unitPrice),
          serviceId: row.serviceId,
          billing: row.billing,
          packageKey: row.packageKey,
          optional: row.kind !== "included",
          selected: row.kind !== "add_on",
        })),
      packages: packages.map((pkg) => ({
        key: pkg.key,
        name: pkg.name.trim(),
        description: pkg.description.trim() || null,
        recommended: pkg.recommended,
      })),
      templateId: fromTemplate?.id ?? null,
    };

    if (templateEditor) {
      const templateInput = {
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        terms: input,
        validForDays: Number.parseInt(validForDays, 10) || null,
      };
      setSubmitting(true);
      try {
        const result = templateEditor.id
          ? await updateTemplateAction(agencyId, templateEditor.id, templateInput)
          : await createTemplateAction(agencyId, templateInput);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Template saved");
        if (!templateEditor.id && result.template) {
          router.push(`/proposals/templates/${result.template.id}`);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {isTemplate && (
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>Template name</span>
            <input
              className={styles.input}
              placeholder="e.g. Website build"
              maxLength={120}
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Description</span>
            <input
              className={styles.input}
              placeholder="When to use it, for your team"
              maxLength={500}
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
            />
          </label>
        </div>
      )}
      {fromTemplate && (
        <p className={styles.leadChip}>
          From the template <strong>{fromTemplate.name}</strong>
          {fromTemplate.attachmentCount > 0
            ? `. Its ${fromTemplate.attachmentCount === 1 ? "document is" : `${fromTemplate.attachmentCount} documents are`} attached when you create the draft.`
            : "."}
        </p>
      )}
      {!isTemplate && leadId && leadName && (
        <p className={styles.leadChip}>
          For the lead <strong>{leadName}</strong>. Signing it turns them
          into a client.
          <button
            type="button"
            className={styles.leadRemove}
            onClick={() => setLeadId(null)}
          >
            Not for this lead
          </button>
        </p>
      )}
      <div className={styles.grid}>
        {!isTemplate && (
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
        )}

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

        {isTemplate ? (
          <label className={styles.field}>
            <span className={styles.label}>Valid for (days)</span>
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              className={styles.input}
              placeholder="No expiry"
              value={validForDays}
              onChange={(event) => setValidForDays(event.target.value)}
            />
          </label>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>Valid until</span>
            <input
              type="date"
              className={styles.input}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </label>
        )}

        {!isTemplate && (
        <>
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
        </>
        )}
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

      <fieldset className={styles.packagesBox}>
        <legend className={styles.legend}>Packages</legend>
        {packages.length === 0 ? (
          <div className={styles.packagesEmpty}>
            <p className={styles.acceptanceHint}>
              Let the client choose between two to four packages, like
              Essential and Complete. A line can belong to one package, and
              only counts if that&apos;s the one they choose.
            </p>
            <button
              type="button"
              className={styles.addRow}
              onClick={() => setPackages([newPackage(), newPackage()])}
            >
              <Plus aria-hidden="true" /> Offer packages
            </button>
          </div>
        ) : (
          <>
            {packages.map((pkg, index) => (
              <div key={pkg.key} className={styles.packageRow}>
                <input
                  className={styles.input}
                  placeholder={index === 0 ? "e.g. Essential" : "e.g. Complete"}
                  maxLength={120}
                  value={pkg.name}
                  onChange={(event) =>
                    updatePackage(pkg.key, { name: event.target.value })
                  }
                  aria-label={`Package ${index + 1} name`}
                />
                <input
                  className={styles.input}
                  placeholder="Who it's for, in a line"
                  maxLength={2000}
                  value={pkg.description}
                  onChange={(event) =>
                    updatePackage(pkg.key, { description: event.target.value })
                  }
                  aria-label={`Package ${index + 1} description`}
                />
                <label className={styles.recommend}>
                  <input
                    type="radio"
                    name="recommended-package"
                    checked={pkg.recommended}
                    onChange={() => recommend(pkg.key)}
                    aria-label={`Recommend package ${index + 1}`}
                  />
                  <span>Recommended</span>
                </label>
                <button
                  type="button"
                  className={styles.removeRow}
                  onClick={() => removePackages([pkg.key])}
                  disabled={packages.length <= 2}
                  aria-label={`Remove package ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className={styles.lineTools}>
              {packages.length < MAX_PACKAGES && (
                <button
                  type="button"
                  className={styles.addRow}
                  onClick={() => setPackages((prev) => [...prev, newPackage()])}
                >
                  <Plus aria-hidden="true" /> Add package
                </button>
              )}
              <button
                type="button"
                className={styles.addDetails}
                onClick={() => removePackages(packages.map((pkg) => pkg.key))}
              >
                Stop offering packages
              </button>
            </div>
            <small className={styles.help}>
              Put each line in a package, or in every package. The
              recommended package is selected until the client picks.
            </small>
            {problem && (
              <p className={styles.problem} role="status">
                {problem}
              </p>
            )}
          </>
        )}
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
            <div className={styles.lineDescription}>
              <input
                className={styles.input}
                placeholder="e.g. Discovery workshop"
                value={row.description}
                onChange={(event) =>
                  updateRow(row.key, { description: event.target.value })
                }
                aria-label={`Line ${index + 1} description`}
              />
              {row.showDetails && (
                <textarea
                  className={styles.textarea}
                  rows={2}
                  maxLength={4000}
                  placeholder="What's included. The client sees this under the line."
                  value={row.details}
                  onChange={(event) =>
                    updateRow(row.key, { details: event.target.value })
                  }
                  aria-label={`Line ${index + 1} details`}
                />
              )}
              <div className={styles.lineMeta}>
                {!row.showDetails && (
                  <button
                    type="button"
                    className={styles.addDetails}
                    onClick={() => updateRow(row.key, { showDetails: true })}
                  >
                    + Details
                  </button>
                )}
                <select
                  className={styles.billing}
                  value={row.billing}
                  onChange={(event) =>
                    updateRow(row.key, {
                      billing: event.target.value as LineBilling,
                    })
                  }
                  aria-label={`Line ${index + 1} billing`}
                >
                  <option value="one_time">One-time</option>
                  <option value="monthly">Monthly</option>
                </select>
                {packages.length > 0 && (
                  <select
                    className={styles.billing}
                    value={row.packageKey ?? ""}
                    onChange={(event) =>
                      updateRow(row.key, {
                        packageKey: event.target.value || null,
                      })
                    }
                    aria-label={`Line ${index + 1} package`}
                  >
                    <option value="">Every package</option>
                    {packages.map((pkg, packageIndex) => (
                      <option key={pkg.key} value={pkg.key}>
                        {pkg.name.trim() || `Package ${packageIndex + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className={styles.billing}
                  value={row.kind}
                  onChange={(event) =>
                    updateRow(row.key, { kind: event.target.value as LineKind })
                  }
                  aria-label={`Line ${index + 1} type`}
                >
                  <option value="included">Included</option>
                  <option value="add_on">Optional add-on</option>
                  <option value="add_on_on">Add-on, pre-selected</option>
                </select>
              </div>
            </div>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={row.quantity}
              onChange={(event) =>
                updateRow(row.key, { quantity: event.target.value })
              }
              aria-label={`Line ${index + 1} quantity`}
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={row.unitPrice}
              onChange={(event) =>
                updateRow(row.key, { unitPrice: event.target.value })
              }
              aria-label={`Line ${index + 1} unit price`}
            />
            <span className={styles.lineAmount}>
              {formatMoneyCents(totals.lineAmounts[index] ?? 0, currency)}
              {billingSuffix(row.billing)}
            </span>
            <button
              type="button"
              className={styles.removeRow}
              onClick={() =>
                setRows((prev) =>
                  prev.length > 1
                    ? prev.filter((r) => r.key !== row.key)
                    : prev,
                )
              }
              disabled={rows.length <= 1}
              aria-label={`Remove line ${index + 1}`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className={styles.lineTools}>
          <button
            type="button"
            className={styles.addRow}
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            <Plus aria-hidden="true" /> Add line
          </button>
          <ServicePicker
            services={services}
            currency={currency}
            onPick={addService}
          />
        </div>
      </div>

      <fieldset className={styles.acceptance}>
        <legend className={styles.legend}>When it&apos;s accepted</legend>
        <p className={styles.acceptanceHint}>
          Once it&apos;s signed{requiresCountersign ? " and countersigned" : ""}
          , {leadId ? "the lead becomes a client and " : ""}the signer is
          invited to the client portal.
          {totals.hasMonthly &&
            " The monthly lines are invoiced every month from when the work starts, as a recurring invoice you can pause."}{" "}
          You can also:
        </p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="proposal-deposit">
            Deposit (% of the total)
          </label>
          <input
            id="proposal-deposit"
            className={styles.input}
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="No deposit"
            value={depositPercent}
            aria-describedby="proposal-deposit-help"
            onChange={(event) => setDepositPercent(event.target.value)}
          />
          <small id="proposal-deposit-help" className={styles.help}>
            {totals.hasMonthly ? "Of the one-time total. " : ""}Invoiced
            automatically; the project waits until it&apos;s paid.
          </small>
        </div>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={createProject}
            onChange={(event) => setCreateProject(event.target.checked)}
          />
          <span>
            Start a project for the work
            <small>Named after the proposal, for the new client.</small>
          </span>
        </label>
        {createProject && kickoffTemplates.length > 0 && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="proposal-kickoff">
              Kickoff questionnaire
            </label>
            <select
              id="proposal-kickoff"
              className={styles.input}
              value={kickoffTemplateId}
              aria-describedby="proposal-kickoff-help"
              onChange={(event) => setKickoffTemplateId(event.target.value)}
            >
              <option value="">None</option>
              {kickoffTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <small id="proposal-kickoff-help" className={styles.help}>
              Sent to the client when they join their portal.
            </small>
          </div>
        )}
      </fieldset>

      <div className={styles.bottom}>
        <div className={styles.terms}>
          <label className={styles.field}>
            <span className={styles.label}>Currency</span>
            <input
              className={styles.input}
              maxLength={3}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
            />
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={requiresCountersign}
              onChange={(event) => setRequiresCountersign(event.target.checked)}
            />
            <span>
              Require our countersignature
              <small>
                After the client signs, an owner or admin signs for the agency.
                The proposal is complete once both have.
              </small>
            </span>
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={requireEmailCode}
              onChange={(event) => setRequireEmailCode(event.target.checked)}
            />
            <span>
              Ask for an email code to open it
              <small>
                The share link alone won&apos;t open it: the recipient enters
                a code we email to them. For sensitive pricing.
              </small>
            </span>
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

        <div className={styles.totals}>
          {(startingPackage || hasAddOns) && (
            <p className={styles.totalsNote}>
              {startingPackage
                ? `For ${startingPackage.name.trim() || "the first package"}${hasAddOns ? " with the pre-selected add-ons" : ""}.`
                : "With the pre-selected add-ons."}{" "}
              The client&apos;s choice sets the final price.
            </p>
          )}
          <dl className={styles.totalRows}>
            {totals.rows.map((row) => (
              <div
                key={`${row.label}-${row.perMonth}`}
                className={row.grand ? styles.grandTotal : undefined}
              >
                <dt>{row.label}</dt>
                <dd>
                  {formatMoneyCents(row.cents, currency)}
                  {row.perMonth ? PER_MONTH : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => router.back()}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.submit}
          disabled={!canSubmit || submitting}
        >
          {submitting
            ? "Saving…"
            : isTemplate
              ? "Save template"
              : isEdit
                ? "Save draft"
                : "Create draft"}
        </button>
      </div>
    </form>
  );
};

export default ProposalForm;
