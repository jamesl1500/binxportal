/**
 * BulkImportWizard.tsx
 *
 * Import clients or team invitations from a .csv / .xlsx file, in four steps:
 *
 *   1. Upload  — drop or pick a file (templates to download alongside)
 *   2. Match   — which column is which field; pre-filled by binx-api's guess
 *   3. Review  — a dry run: every row marked ready / duplicate / needs fixing /
 *                over the plan limit, before anything is written
 *   4. Done    — what was imported, and what was skipped and why
 *
 * Product rules (enforced by binx-api, explained here in the UI): duplicates
 * are skipped, and past the plan limit the first rows that fit are imported
 * and the rest skipped. Used on the Clients page, the Team invitations page,
 * and onboarding step four — the caller supplies where "Done" leads.
 *
 * @module apps/binx-web/src/components/imports/BulkImportWizard/BulkImportWizard.tsx
 * @author Binx.io
 */
"use client";

import { type ChangeEvent, type DragEvent, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";

import { parseImportFileAction, runImportAction } from "@/app/(app)/imports/actions";
import {
  applyImportMapping,
  type ImportKind,
  type ImportMapping,
  type ImportParseResult,
  type ImportResult,
  type ImportRowResult,
  importTemplateHref,
  missingRequiredFields,
} from "@/lib/imports-client";

import styles from "./BulkImportWizard.module.scss";

type Step = "upload" | "map" | "review" | "done";
type Filter = "all" | "ready" | "skipped";

const COPY: Record<
  ImportKind,
  {
    labelHeading: string;
    maxRows: number;
    action: (n: number) => string;
    done: (n: number) => string;
    limitNoun: string;
  }
> = {
  clients: {
    labelHeading: "Client",
    maxRows: 500,
    action: (n) => `Import ${n} ${n === 1 ? "client" : "clients"}`,
    done: (n) => `Imported ${n} ${n === 1 ? "client" : "clients"}`,
    limitNoun: "clients",
  },
  team: {
    labelHeading: "Email",
    maxRows: 100,
    action: (n) => `Send ${n} ${n === 1 ? "invite" : "invites"}`,
    done: (n) => `Invited ${n} ${n === 1 ? "person" : "people"} — they'll get an email shortly`,
    limitNoun: "team members (including pending invites)",
  },
};

const STATUS_LABELS: Record<ImportRowResult["status"], { review: string; done: string }> = {
  ok: { review: "Ready", done: "Imported" },
  duplicate: { review: "Duplicate", done: "Skipped · duplicate" },
  invalid: { review: "Needs fixing", done: "Skipped · needs fixing" },
  over_limit: { review: "Over plan limit", done: "Skipped · over plan limit" },
};

interface BulkImportWizardProps {
  agencyId: string;
  kind: ImportKind;
  /** Where the Done step's primary button leads (e.g. the Clients page, or the next onboarding step). */
  nextHref?: string;
  nextLabel?: string;
  /** Called after a real (not dry-run) import finishes. */
  onImported?: (result: ImportResult) => void;
}

const ResultsTable = ({
  rows,
  heading,
  phase,
}: {
  rows: ImportRowResult[];
  heading: string;
  phase: "review" | "done";
}) => (
  <div className={styles.tableScroll}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Row</th>
          <th scope="col">{heading}</th>
          <th scope="col">Status</th>
          <th scope="col">Details</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.row}>
            <td className={styles.rowNumber}>{row.row}</td>
            <td className={styles.rowLabel}>{row.label}</td>
            <td>
              <span className={styles.status} data-status={row.status}>
                {STATUS_LABELS[row.status][phase]}
              </span>
            </td>
            <td className={styles.rowMessage}>{row.message ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const BulkImportWizard = ({ agencyId, kind, nextHref, nextLabel, onImported }: BulkImportWizardProps) => {
  const copy = COPY[kind];
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [review, setReview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const missing = parsed ? missingRequiredFields(parsed.fields, mapping) : [];

  // First non-empty value in each column, shown under the mapping selects.
  const samples = useMemo(
    () => parsed?.columns.map((_, index) => parsed.rows.find((row) => row.cells[index])?.cells[index] ?? "") ?? [],
    [parsed],
  );

  const reset = () => {
    setStep("upload");
    setFileName(null);
    setParsed(null);
    setMapping({});
    setReview(null);
    setResult(null);
    setFilter("all");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const response = await parseImportFileAction(agencyId, kind, formData);
      if (response.error || !response.parsed) {
        setError(response.error ?? "Unable to read that file");
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setParsed(response.parsed);
      setMapping(response.parsed.mapping);
      setStep("map");
    });
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const runCheck = () => {
    if (!parsed || missing.length > 0) return;
    setError(null);
    startTransition(async () => {
      const response = await runImportAction(agencyId, kind, applyImportMapping(parsed, mapping), true);
      if (response.error || !response.result) {
        setError(response.error ?? "Unable to check those rows");
        return;
      }
      setReview(response.result);
      setFilter("all");
      setStep("review");
    });
  };

  const runImport = () => {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      const response = await runImportAction(agencyId, kind, applyImportMapping(parsed, mapping), false);
      if (response.error || !response.result) {
        setError(response.error ?? "Unable to import");
        return;
      }
      setResult(response.result);
      setStep("done");
      onImported?.(response.result);
      router.refresh();
    });
  };

  const errorBanner = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );

  // ---- Upload ----
  if (step === "upload") {
    return (
      <div className={styles.wizard}>
        <label
          htmlFor={inputId}
          className={styles.dropzone}
          data-dragging={dragging}
          data-busy={isPending}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className={styles.dropIcon} aria-hidden="true" />
          <span className={styles.dropTitle}>
            {isPending ? `Reading ${fileName ?? "file"}…` : "Drop a .csv or .xlsx file here, or click to browse"}
          </span>
          <span className={styles.dropHint}>
            First row should be column headings · up to {copy.maxRows} rows · 2MB max
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={styles.fileInput}
            disabled={isPending}
            onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])}
            aria-label={`Upload a ${kind} spreadsheet`}
          />
        </label>

        <p className={styles.templates}>
          <Download aria-hidden="true" />
          Start from a template:{" "}
          <a href={importTemplateHref(kind, "csv")} download>
            CSV
          </a>{" "}
          ·{" "}
          <a href={importTemplateHref(kind, "xlsx")} download>
            Excel
          </a>
        </p>
        {errorBanner}
      </div>
    );
  }

  // ---- Match columns ----
  if (step === "map" && parsed) {
    return (
      <div className={styles.wizard}>
        <div className={styles.fileBadge}>
          <FileSpreadsheet aria-hidden="true" />
          <span>
            {fileName} · {parsed.rows.length} {parsed.rows.length === 1 ? "row" : "rows"}
          </span>
        </div>

        <h3 className={styles.stepTitle}>Match your columns</h3>
        <p className={styles.stepSubtitle}>
          We&apos;ve matched what we could. Check each field and pick the column it should come from.
        </p>

        <div className={styles.mapGrid}>
          {parsed.fields.map((field) => {
            const selectId = `${inputId}-${field.key}`;
            const column = mapping[field.key];
            const sample = column === null || column === undefined ? "" : samples[column];
            const isMissing = missing.some((item) => item.key === field.key);
            return (
              <div key={field.key} className={styles.mapField}>
                <label htmlFor={selectId} className={styles.mapLabel}>
                  {field.label}
                  {field.required && <span className={styles.required}> (required)</span>}
                </label>
                <select
                  id={selectId}
                  className={styles.select}
                  value={column ?? ""}
                  aria-invalid={isMissing}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: event.target.value === "" ? null : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">— Don&apos;t import —</option>
                  {parsed.columns.map((name, index) => (
                    <option key={index} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className={styles.sample}>{sample ? `e.g. ${sample}` : " "}</span>
              </div>
            );
          })}
        </div>

        {missing.length > 0 && (
          <p className={styles.warning}>Choose a column for {missing.map((field) => field.label).join(", ")}.</p>
        )}
        {errorBanner}

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={reset} disabled={isPending}>
            Choose a different file
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={runCheck}
            disabled={isPending || missing.length > 0}
          >
            {isPending ? "Checking…" : "Review rows"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Review ----
  if (step === "review" && review) {
    const skipped = review.rows.length - review.imported;
    const visible = review.rows.filter((row) =>
      filter === "all" ? true : filter === "ready" ? row.status === "ok" : row.status !== "ok",
    );

    return (
      <div className={styles.wizard}>
        <h3 className={styles.stepTitle}>Review</h3>
        <p className={styles.stepSubtitle}>
          Nothing has been imported yet. Skipped rows can be fixed in your file and imported later.
        </p>

        <ul className={styles.summary}>
          <li data-status="ok">
            <strong>{review.imported}</strong> ready
          </li>
          {review.duplicates > 0 && (
            <li data-status="duplicate">
              <strong>{review.duplicates}</strong> {review.duplicates === 1 ? "duplicate" : "duplicates"}
            </li>
          )}
          {review.invalid > 0 && (
            <li data-status="invalid">
              <strong>{review.invalid}</strong> need fixing
            </li>
          )}
          {review.over_limit > 0 && (
            <li data-status="over_limit">
              <strong>{review.over_limit}</strong> over plan limit
            </li>
          )}
        </ul>

        {review.over_limit > 0 && review.limit !== null && (
          <p className={styles.limitBanner}>
            Your {review.plan_name} plan allows {review.limit} {copy.limitNoun}
            {review.remaining ? ` and has room for ${review.remaining} more` : ", and that's already reached"}, so{" "}
            {review.over_limit} {review.over_limit === 1 ? "row" : "rows"} will be skipped.{" "}
            <Link href="/settings/plan">Upgrade your plan</Link> to import the rest.
          </p>
        )}

        <div className={styles.filters} role="group" aria-label="Filter rows">
          {(
            [
              ["all", `All (${review.rows.length})`],
              ["ready", `Ready (${review.imported})`],
              ["skipped", `Skipped (${skipped})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={styles.filter}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <ResultsTable rows={visible} heading={copy.labelHeading} phase="review" />
        {errorBanner}

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={() => setStep("map")} disabled={isPending}>
            Back
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={runImport}
            disabled={isPending || review.imported === 0}
          >
            {isPending ? "Importing…" : review.imported === 0 ? `Nothing to import` : copy.action(review.imported)}
          </button>
        </div>
      </div>
    );
  }

  // ---- Done ----
  if (step === "done" && result) {
    const skippedRows = result.rows.filter((row) => row.status !== "ok");
    return (
      <div className={styles.wizard}>
        <div className={styles.doneHeader}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h3 className={styles.stepTitle}>{copy.done(result.imported)}</h3>
            {skippedRows.length > 0 && (
              <p className={styles.stepSubtitle}>
                {skippedRows.length} {skippedRows.length === 1 ? "row was" : "rows were"} skipped — see why below.
              </p>
            )}
          </div>
        </div>

        {skippedRows.length > 0 && <ResultsTable rows={skippedRows} heading={copy.labelHeading} phase="done" />}

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={reset}>
            Import another file
          </button>
          {nextHref && (
            <Link href={nextHref} className={styles.primary}>
              {nextLabel ?? "Done"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default BulkImportWizard;
