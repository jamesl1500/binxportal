/**
 * imports.ts
 *
 * Bulk import of clients and team invitations from .csv / .xlsx, via
 * binx-api's `/agencies/{agencyId}/imports` endpoints. Two stateless calls:
 * `parseImportFile` reads the file and suggests a column → field mapping;
 * `runImport` sends the mapped rows — `dryRun: true` for the Review step,
 * then `false` to actually import. binx-api re-validates every row either way.
 *
 * Server-only (reads the session's access token) — Client Components go
 * through the server actions in app/(app)/imports/actions.ts, and use the
 * plain helpers in `imports-client.ts`.
 *
 * @module apps/binx-web/src/lib/imports.ts
 * @author Binx Portal
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type {
  ImportKind,
  ImportParseResult,
  ImportResult,
  MappedImportRow,
} from "@/lib/imports-client";

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(
      extractDetailMessage(error.response.data, fallback),
      error.response.status,
    );
  }
  return error;
}

/**
 * parseImportFile
 *
 * Uploads a spreadsheet via `POST /agencies/{agencyId}/imports/{kind}/parse`
 * and returns its columns, rows, and a suggested mapping. Nothing is stored.
 *
 * @function parseImportFile
 * @throws {AuthApiError} - Unreadable/oversized/unsupported file (400/413/415), or not allowed (403).
 */
export async function parseImportFile(
  agencyId: string,
  kind: ImportKind,
  file: File,
): Promise<ImportParseResult> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);

  try {
    // Same Content-Type override as uploadProjectFile in lib/projects.ts —
    // lets axios set the multipart boundary itself.
    const { data } = await api.post<ImportParseResult>(
      `/agencies/${agencyId}/imports/${kind}/parse`,
      formData,
      {
        headers: { ...headers, "Content-Type": undefined },
      },
    );
    return data;
  } catch (error) {
    throw apiError(error, "Unable to read that file");
  }
}

/**
 * runImport
 *
 * Validates (`dryRun: true`) or imports (`dryRun: false`) mapped rows via
 * `POST /agencies/{agencyId}/imports/{clients|team}`. Duplicates, invalid
 * rows, and rows past the plan limit are skipped and reported per row.
 *
 * @function runImport
 * @throws {AuthApiError} - Thrown if not authenticated or not allowed.
 */
export async function runImport(
  agencyId: string,
  kind: ImportKind,
  rows: MappedImportRow[],
  dryRun: boolean,
): Promise<ImportResult> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<ImportResult>(
      `/agencies/${agencyId}/imports/${kind}`,
      { rows, dry_run: dryRun },
      { headers },
    );
    return data;
  } catch (error) {
    throw apiError(
      error,
      dryRun ? "Unable to check those rows" : "Unable to import",
    );
  }
}
