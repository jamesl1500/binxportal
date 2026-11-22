/**
 * admin-errors.ts
 *
 * Server-only helpers for the admin error dashboard (`/admin/errors`),
 * backed by binx-api's `/admin/errors/*` (platform admins only). Types and
 * labels shared with client components live in `lib/admin-errors-client.ts`.
 *
 * @module apps/binx-web/src/lib/admin-errors.ts
 * @author Binx Portal
 */
import { api } from "@/lib/api";
import { apiErrorFrom, AuthApiError, getAccessToken } from "@/lib/auth";
import type {
  ErrorIssueDetail,
  ErrorIssueRow,
  ErrorSource,
  ErrorSummary,
  IssuePeriod,
  IssueSort,
  IssueStatus,
} from "@/lib/admin-errors-client";

export type * from "@/lib/admin-errors-client";

export const ERROR_PAGE_SIZE = 25;

async function headers(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new AuthApiError("Not authenticated", 401);
  return { Authorization: `Bearer ${accessToken}` };
}

async function get<T>(
  path: string,
  fallback: string,
  params?: Record<string, string | number>,
): Promise<T> {
  try {
    const { data } = await api.get<T>(path, {
      headers: await headers(),
      ...(params ? { params } : {}),
    });
    return data;
  } catch (error) {
    throw apiErrorFrom(error, fallback);
  }
}

export function getErrorSummary(): Promise<ErrorSummary> {
  return get("/admin/errors/summary", "Unable to load the error summary");
}

/** Unresolved issues seen in the last 24 hours, for the sidebar badge. */
export async function getOpenErrorCount(): Promise<number> {
  const { open_issues_24h } = await get<{ open_issues_24h: number }>(
    "/admin/errors/badge",
    "Unable to load the error count",
  );
  return open_issues_24h;
}

export interface IssueFilter {
  status?: IssueStatus;
  source?: ErrorSource;
  period: IssuePeriod;
  sort: IssueSort;
  q?: string;
  offset?: number;
}

export function getErrorIssues(
  filter: IssueFilter,
): Promise<{ items: ErrorIssueRow[]; total: number }> {
  const params: Record<string, string | number> = {
    period: filter.period,
    sort: filter.sort,
    limit: ERROR_PAGE_SIZE,
  };
  if (filter.status) params.status = filter.status;
  if (filter.source) params.source = filter.source;
  if (filter.q?.trim()) params.q = filter.q.trim();
  if (filter.offset) params.offset = filter.offset;
  return get("/admin/errors/issues", "Unable to load errors", params);
}

export function getErrorIssue(
  issueId: string,
  eventId?: string,
): Promise<ErrorIssueDetail> {
  return get(
    `/admin/errors/issues/${encodeURIComponent(issueId)}`,
    "Unable to load the error",
    eventId ? { event_id: eventId } : undefined,
  );
}

/** The occurrence behind a reference a customer quoted ("7F3A9C21") or a
 * request id. Null when nothing matches. */
export async function lookupErrorReference(
  ref: string,
): Promise<{ issue_id: string; event_id: string } | null> {
  try {
    return await get("/admin/errors/lookup", "Lookup failed", { ref });
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) return null;
    throw error;
  }
}

export async function setErrorIssueStatus(
  issueId: string,
  status: IssueStatus,
): Promise<{ status: IssueStatus }> {
  try {
    const { data } = await api.patch<{ status: IssueStatus }>(
      `/admin/errors/issues/${encodeURIComponent(issueId)}`,
      { status },
      { headers: await headers() },
    );
    return data;
  } catch (error) {
    throw apiErrorFrom(error, "Unable to update the issue");
  }
}
