/**
 * imports-client.ts
 *
 * The bulk-import types and pure helpers that are safe in a Client
 * Component (no `lib/auth.ts` / `next/headers` dependency) — same split as
 * projects-client.ts. `lib/imports.ts` does the actual requests.
 *
 * @module apps/binx-web/src/lib/imports-client.ts
 * @author Binx.io
 */
import type { Schemas } from "@/lib/api-types";

export type ImportKind = "clients" | "team";
export type ImportParseResult = Schemas["ImportParseRead"];
export type ImportResult = Schemas["ImportResultRead"];
export type ImportRowResult = Schemas["ImportRowResult"];
export type ImportField = Schemas["ImportFieldRead"];

/** One spreadsheet row with its cells assigned to import fields (field key → value). */
export type MappedImportRow = { row: number } & Record<string, string | number | null>;

/** Column index per field key; null = not imported. */
export type ImportMapping = Record<string, number | null>;

/** Downloadable starter files in `public/templates` — their headers map to every field automatically. */
export function importTemplateHref(kind: ImportKind, format: "csv" | "xlsx"): string {
  return `/templates/${kind}-import-template.${format}`;
}

/** Applies a column mapping to the parsed rows, producing what `runImport` sends. */
export function applyImportMapping(parsed: ImportParseResult, mapping: ImportMapping): MappedImportRow[] {
  return parsed.rows.map(({ row, cells }) => {
    const mapped: MappedImportRow = { row };
    for (const field of parsed.fields) {
      const column = mapping[field.key];
      mapped[field.key] = column === null || column === undefined ? null : (cells[column] ?? null);
    }
    return mapped;
  });
}

/** The required fields that still have no column assigned. */
export function missingRequiredFields(fields: ImportField[], mapping: ImportMapping): ImportField[] {
  return fields.filter((field) => field.required && (mapping[field.key] === null || mapping[field.key] === undefined));
}
