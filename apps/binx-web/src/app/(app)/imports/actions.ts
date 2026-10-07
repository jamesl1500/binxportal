/**
 * actions.ts - Imports
 *
 * Server actions behind BulkImportWizard — used on the Clients page, the
 * Team invitations page, and onboarding step four. No page lives in this
 * folder; it's just the shared home for actions several routes call.
 *
 * @module apps/binx-web/src/app/(app)/imports/actions.ts
 * @author Binx Portal
 */
"use server";

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { parseImportFile, runImport } from "@/lib/imports";
import type {
  ImportKind,
  ImportParseResult,
  ImportResult,
  MappedImportRow,
} from "@/lib/imports-client";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthApiError ? error.message : fallback;
}

export interface ParseImportFileActionResult {
  error?: string;
  parsed?: ImportParseResult;
}

export async function parseImportFileAction(
  agencyId: string,
  kind: ImportKind,
  formData: FormData,
): Promise<ParseImportFileActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .csv or .xlsx file to upload" };
  }
  try {
    return { parsed: await parseImportFile(agencyId, kind, file) };
  } catch (error) {
    return { error: errorMessage(error, "Unable to read that file") };
  }
}

export interface RunImportActionResult {
  error?: string;
  result?: ImportResult;
}

export async function runImportAction(
  agencyId: string,
  kind: ImportKind,
  rows: MappedImportRow[],
  dryRun: boolean,
): Promise<RunImportActionResult> {
  try {
    const result = await runImport(agencyId, kind, rows, dryRun);
    // A real import changes the lists behind the wizard; a dry run doesn't.
    if (!dryRun) refresh();
    return { result };
  } catch (error) {
    return {
      error: errorMessage(
        error,
        dryRun ? "Unable to check those rows" : "Unable to import",
      ),
    };
  }
}
